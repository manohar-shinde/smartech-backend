import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class FileService {

  private readonly privateBucket = 'private-files';
  private readonly publicBucket = 'public-files';
  private readonly signedUrlTtlSeconds = 60;

  private readonly allowedMimeTypes = new Set<string>([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  private readonly maxFileSizeBytes = 25 * 1024 * 1024;

  /**
   * Uploads a buffer to the private bucket at `{organization_id}/{site_id}/{fileName}`.
   * Uses the service-role client (same as {@link uploadFileForUser} for this bucket) so uploads
   * are not blocked by Storage RLS paths that only allow `{auth.uid()}/...`. The API layer must
   * already have verified the user may act for this organization and site.
   */
  async uploadPrivateBufferForOrgSite(
    _token: string,
    organizationId: string,
    siteId: string,
    buffer: Buffer,
    fileName: string,
    contentType = 'application/pdf',
  ) {
    try {
      const safeName = this.sanitizeFileName(fileName);
      if (!safeName) {
        return { success: false, message: 'A valid file name is required' };
      }
      const objectPath = `${organizationId}/${siteId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(this.privateBucket)
        .upload(objectPath, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        return {
          success: false,
          message: this.formatSupabaseError('Storage upload failed', uploadError),
        };
      }

      return {
        success: true,
        message: 'File uploaded successfully',
        data: {
          bucket: this.privateBucket,
          object_path: objectPath,
          file_name: safeName,
          mime_type: contentType,
          size_bytes: buffer.length,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  private formatSupabaseError(
    prefix: string,
    error: {
      message?: string;
      code?: string;
    },
  ) {
    const codeSuffix = error?.code ? ` (${error.code})` : '';
    return `${prefix}${codeSuffix}: ${error?.message || 'Unknown error'}`;
  }

  private buildPublicStorageUrl(objectPath: string): string {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!base) {
      return '';
    }
    const encoded = objectPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${base}/storage/v1/object/public/${this.publicBucket}/${encoded}`;
  }

  async uploadFileForUser(userId: string, file: any, payload: UploadFileDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!file) {
        return { success: false, message: 'File is required' };
      }

      if (!this.allowedMimeTypes.has(file.mimetype)) {
        return { success: false, message: 'Unsupported file type' };
      }

      if (file.size > this.maxFileSizeBytes) {
        return { success: false, message: 'File size exceeds 25MB limit' };
      }

      const fileName = this.sanitizeFileName(
        payload?.file_name || file.originalname,
      );

      if (!fileName) {
        return {
          success: false,
          message: 'A valid file name is required',
        };
      }

      const objectPath = `${userId}/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(this.privateBucket)
        .upload(objectPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false, // safer (avoid overwriting)
        });

      if (uploadError) {
        return {
          success: false,
          message: this.formatSupabaseError(
            'Storage upload failed',
            uploadError,
          ),
        };
      }

      return {
        success: true,
        message: 'File uploaded successfully',
        data: {
          object_path: objectPath,
          file_name: fileName,
          original_name: file.originalname,
          mime_type: file.mimetype,
          size_bytes: file.size,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /**
   * Uploads to the public storage bucket under `{user_id}/{file_name}`.
   * Uses the user JWT so Storage RLS (e.g. path prefix vs auth.uid()) can pass.
   */
  async uploadPublicFileForUser(
    userId: string,
    token: string,
    file: any,
    payload: UploadFileDto,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!file) {
        return { success: false, message: 'File is required' };
      }

      if (!this.allowedMimeTypes.has(file.mimetype)) {
        return { success: false, message: 'Unsupported file type' };
      }

      if (file.size > this.maxFileSizeBytes) {
        return { success: false, message: 'File size exceeds 25MB limit' };
      }

      const fileName = this.sanitizeFileName(
        payload?.file_name || file.originalname,
      );

      if (!fileName) {
        return {
          success: false,
          message: 'A valid file name is required',
        };
      }

      const objectPath = `${userId}/${fileName}`;

      const userSupabase = getUserSupabaseClient(token);
      const { error: uploadError } = await userSupabase.storage
        .from(this.publicBucket)
        .upload(objectPath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        const lower = uploadError.message?.toLowerCase?.() ?? '';
        if (lower.includes('duplicate') || lower.includes('already exists')) {
          return {
            success: false,
            message:
              'A file with this name already exists in your folder. Use a different name or remove the existing object.',
          };
        }
        return {
          success: false,
          message: this.formatSupabaseError(
            'Public storage upload failed',
            uploadError,
          ),
        };
      }

      const public_url = this.buildPublicStorageUrl(objectPath);

      return {
        success: true,
        message: 'File uploaded successfully',
        data: {
          bucket: this.publicBucket,
          object_path: objectPath,
          public_url: public_url || undefined,
          user_id: userId,
          file_name: fileName,
          original_name: file.originalname,
          mime_type: file.mimetype,
          size_bytes: file.size,
        },
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async listFilesForUser(userId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const { data, error } = await supabase.storage
        .from(this.privateBucket)
        .list(userId, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        return {
          success: false,
          message: this.formatSupabaseError('File list fetch failed', error),
        };
      }

      return {
        success: true,
        data: (data || []).map((file) => ({
          name: file.name,
          object_path: `${userId}/${file.name}`,
          app_file_url: this.buildAppFileUrl(`${userId}/${file.name}`),
          bucket: this.privateBucket,
          created_at: file.created_at,
          updated_at: file.updated_at,
          last_accessed_at: file.last_accessed_at,
          metadata: file.metadata,
        })),
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  /**
   * Signed read access for `private-files` when the path is either
   * `{user_id}/...` (uploader) or `{organization_id}/{site_id}/...` (org/site
   * uploads) and the user is an org owner or member for that organization, and
   * the site belongs to the organization.
   */
  async getPrivateFileDownloadUrl(
    userId: string,
    filePath: string,
    expiresInRaw: number = 60 * 10,
  ) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const objectPath = typeof filePath === 'string' ? filePath.trim() : '';
      if (!this.isPrivateBucketPathPlausible(objectPath)) {
        return { success: false, message: 'Invalid file path' };
      }

      const expiresIn = this.clampSignedUrlTtl(expiresInRaw);

      const canRead = await this.userCanReadPrivatePath(userId, objectPath);
      if (!canRead) {
        return {
          success: false,
          message: 'Forbidden: you do not have access to this file',
        };
      }

      const { data, error: signedError } = await supabase.storage
        .from(this.privateBucket)
        .createSignedUrl(objectPath, expiresIn);

      if (signedError) {
        return {
          success: false,
          message: this.formatSupabaseError(
            'Signed URL generation failed',
            signedError,
          ),
        };
      }
      if (!data?.signedUrl) {
        return { success: false, message: 'Signed URL not available' };
      }

      const fileName = objectPath.split('/').filter(Boolean).pop() ?? 'file';
      return {
        success: true,
        data: {
          bucket: this.privateBucket,
          object_path: objectPath,
          file_name: fileName,
          expires_in_seconds: expiresIn,
          signed_url: data.signedUrl,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  private clampSignedUrlTtl(raw: number) {
    const n = Number.isFinite(raw) ? raw : 60 * 10;
    return Math.min(Math.max(Math.floor(n), 60), 3600);
  }

  private isPrivateBucketPathPlausible(objectPath: string) {
    if (!objectPath || objectPath.length > 512) {
      return false;
    }
    if (objectPath.includes('..') || objectPath.startsWith('/')) {
      return false;
    }
    return objectPath.split('/').filter(Boolean).length >= 2;
  }

  private async userCanReadPrivatePath(
    userId: string,
    objectPath: string,
  ): Promise<boolean> {
    if (this.isUserOwnedPath(userId, objectPath)) {
      return true;
    }
    if (!this.isValidPrivateOrgSiteObjectPath(objectPath)) {
      return false;
    }
    const parts = objectPath.split('/').filter(Boolean);
    const orgId = parts[0]!;
    const siteId = parts[1]!;
    const canOrg = await this.userCanAccessOrganization(userId, orgId);
    if (!canOrg) {
      return false;
    }
    return this.siteBelongsToOrganization(siteId, orgId);
  }

  /** Org owner, or a row in `organization_members` for that org. */
  private async userCanAccessOrganization(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data: asOwner } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (asOwner) {
      return true;
    }
    const { data: member } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();
    return !!member;
  }

  private async siteBelongsToOrganization(
    siteId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    return !error && !!data;
  }

  async getDownloadUrlByPath(
    userId: string,
    objectPath: string,
    expiresIn = 60 * 10,
  ) {
    return this.getPrivateFileDownloadUrl(userId, objectPath, expiresIn);
  }

  async getOpenUrlForUserPath(userId: string, objectPath: string) {
    const result = await this.getPrivateFileDownloadUrl(
      userId,
      objectPath,
      this.signedUrlTtlSeconds,
    );
    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message || 'Failed to open file',
      };
    }
    return {
      success: true,
      data: {
        redirect_url: result.data.signed_url,
        expires_in_seconds: result.data.expires_in_seconds,
      },
    };
  }

  async deleteFileByPath(userId: string, objectPath: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!this.isUserOwnedPath(userId, objectPath)) {
        return {
          success: false,
          message: 'Invalid file path',
        };
      }

      const { error: storageError } = await supabase.storage
        .from(this.privateBucket)
        .remove([objectPath]);

      if (storageError) {
        return {
          success: false,
          message: this.formatSupabaseError(
            'Storage delete failed',
            storageError,
          ),
        };
      }

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  private sanitizeFileName(fileName: string) {
    return fileName
      ?.trim()
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');
  }

  private isUserOwnedPath(userId: string, objectPath: string) {
    return !!objectPath && objectPath.startsWith(`${userId}/`);
  }

  /**
   * Whether `objectPath` is the org/site shape used for private PDFs:
   * `{organization_id}/{site_id}/{file_name}`. Rejects path traversal and empty segments.
   */
  private isValidPrivateOrgSiteObjectPath(objectPath: string): boolean {
    if (!objectPath || objectPath.length > 512) {
      return false;
    }
    if (objectPath.includes('..') || objectPath.startsWith('/')) {
      return false;
    }
    const parts = objectPath.split('/').filter(Boolean);
    if (parts.length < 3) {
      return false;
    }
    return parts.every((p) => p.length > 0);
  }

  private buildAppFileUrl(objectPath: string) {
    const baseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
    const openPath = `/files/open?path=${encodeURIComponent(objectPath)}`;

    if (!baseUrl) {
      return openPath;
    }

    return `${baseUrl.replace(/\/$/, '')}${openPath}`;
  }
}
