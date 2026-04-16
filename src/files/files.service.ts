import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class FilesService {
  private readonly privateBucket = 'private-files';
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

  async uploadFileForUser(userId: string, file: any, payload: UploadFileDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!file) {
        return { success: false, message: 'file is required' };
      }

      if (!this.allowedMimeTypes.has(file.mimetype)) {
        return { success: false, message: 'Unsupported file type' };
      }

      if (file.size > this.maxFileSizeBytes) {
        return { success: false, message: 'File size exceeds 25MB limit' };
      }

      const bucket = this.privateBucket;
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

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
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

      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, 60 * 60);

      if (signedError) {
        return {
          success: false,
          message: this.formatSupabaseError(
            'Signed URL generation failed',
            signedError,
          ),
        };
      }

      return {
        success: true,
        message: 'File uploaded successfully',
        data: {
          bucket,
          object_path: objectPath,
          app_file_url: this.buildAppFileUrl(objectPath),
          file_name: fileName,
          original_name: file.originalname,
          mime_type: file.mimetype,
          size_bytes: file.size,
          signed_url: signedData.signedUrl,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
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

  async getDownloadUrlByPath(
    userId: string,
    objectPath: string,
    expiresIn = 60 * 10,
  ) {
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

      const { data: signedData, error: signedError } = await supabase.storage
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

      return {
        success: true,
        data: {
          bucket: this.privateBucket,
          object_path: objectPath,
          expires_in_seconds: expiresIn,
          signed_url: signedData.signedUrl,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async getOpenUrlForUserPath(userId: string, objectPath: string) {
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

      const { data: signedData, error: signedError } = await supabase.storage
        .from(this.privateBucket)
        .createSignedUrl(objectPath, this.signedUrlTtlSeconds);

      if (signedError) {
        return {
          success: false,
          message: this.formatSupabaseError(
            'Signed URL generation failed',
            signedError,
          ),
        };
      }

      return {
        success: true,
        data: {
          redirect_url: signedData.signedUrl,
          expires_in_seconds: this.signedUrlTtlSeconds,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
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

  private buildAppFileUrl(objectPath: string) {
    const baseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
    const openPath = `/files/open?path=${encodeURIComponent(objectPath)}`;

    if (!baseUrl) {
      return openPath;
    }

    return `${baseUrl.replace(/\/$/, '')}${openPath}`;
  }
}
