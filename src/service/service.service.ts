import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { CreateServiceDto } from './dto/create-service.dto';

@Injectable()
export class ServiceService {
  /**
   * Owners resolve via organizations; members via organization_members (same as breakdowns).
   */
  private async getOrganizationContextForService(
    userId: string,
  ): Promise<{ success: boolean; organizationId?: string; message?: string }> {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const { data: ownedOrgs, error: ownedError } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (ownedError) {
        return { success: false, message: ownedError.message };
      }

      const ownedId = ownedOrgs?.[0]?.id as string | undefined;
      if (ownedId) {
        return { success: true, organizationId: ownedId };
      }

      const { data: membership, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memberError) {
        return { success: false, message: memberError.message };
      }

      const organizationId = membership?.organization_id as string | undefined;
      if (!organizationId) {
        return {
          success: false,
          message: 'Organization not found for this user',
        };
      }

      return { success: true, organizationId };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async createService(userId: string, token: string, payload: CreateServiceDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!payload?.name?.trim()) {
        return { success: false, message: 'name is required' };
      }

      const orgContext = await this.getOrganizationContextForService(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const row = {
        organization_id: orgContext.organizationId,
        name: payload.name.trim(),
        description: payload.description?.trim() ? payload.description.trim() : null,
        service_type: payload.service_type ?? 'maintenance',
        is_amc: payload.is_amc ?? false,
      };

      const { data, error } = await userSupabase
        .from('services')
        .insert([row])
        .select()
        .single();

      if (error) {
        const lower = error.message.toLowerCase();
        if (lower.includes('duplicate') || lower.includes('unique')) {
          return {
            success: false,
            message:
              'A service with this name already exists for your organization. Choose a different name.',
          };
        }
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Service created successfully',
        data,
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async findAllForOrganization(
    userId: string,
    token: string,
    serviceType?: string,
    isAmc?: string,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationContextForService(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      let query = userSupabase
        .from('services')
        .select('*')
        .eq('organization_id', orgContext.organizationId)
        .order('name', { ascending: true });

      if (serviceType) {
        query = query.eq('service_type', serviceType);
      }

      if (isAmc === 'true' || isAmc === '1') {
        query = query.eq('is_amc', true);
      } else if (isAmc === 'false' || isAmc === '0') {
        query = query.eq('is_amc', false);
      }

      const { data, error } = await query;

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Services fetched successfully',
        data,
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async findById(userId: string, token: string, serviceId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!serviceId) {
        return { success: false, message: 'Service ID is required' };
      }

      const orgContext = await this.getOrganizationContextForService(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data) {
        return { success: false, message: 'Service not found' };
      }

      return {
        success: true,
        message: 'Service retrieved successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }
}
