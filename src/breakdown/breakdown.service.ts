import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { CreateBreakdownDto, UpdateBreakdownDto } from './dto';

@Injectable()
export class BreakdownService {
  /**
   * RLS on breakdowns requires organization_members. Owners are resolved via
   * organizations; everyone else via organization_members (same org as parts).
   */
  private async getOrganizationContextForBreakdowns(
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

  async createBreakdown(userId: string, token: string, payload: CreateBreakdownDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!payload?.site_id) {
        return { success: false, message: 'site_id is required' };
      }

      if (!payload?.title) {
        return { success: false, message: 'title is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);

      const { data: siteData, error: siteError } = await userSupabase
        .from('sites')
        .select('id, organization_id')
        .eq('id', payload.site_id)
        .eq('organization_id', orgContext.organizationId)
        .single();

      if (siteError || !siteData) {
        return {
          success: false,
          message: 'Site not found or does not belong to your organization',
        };
      }

      const breakdownPayload = {
        organization_id: orgContext.organizationId,
        site_id: payload.site_id,
        assigned_to: payload.assigned_to || null,
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority || 'medium',
        status: payload.status || 'open',
        reported_by: userId,
        images: payload.images || null,
      };

      const { data, error } = await userSupabase
        .from('breakdowns')
        .insert([breakdownPayload])
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Breakdown created successfully',
        data,
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async findAllForSite(userId: string, token: string, siteId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!siteId) {
        return { success: false, message: 'Site ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .select('*')
        .eq('site_id', siteId)
        .eq('organization_id', orgContext.organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findBreakdownById(userId: string, token: string, breakdownId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .select('*')
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId)
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data) {
        return { success: false, message: 'Breakdown not found' };
      }

      return {
        success: true,
        message: 'Breakdown details retrieved successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async updateBreakdown(
    userId: string,
    token: string,
    breakdownId: string,
    payload: UpdateBreakdownDto,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const updatePayload = {
        ...payload,
        updated_at: new Date().toISOString(),
      };

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .update(updatePayload)
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId)
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Breakdown updated successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async deleteBreakdown(userId: string, token: string, breakdownId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { error } = await userSupabase
        .from('breakdowns')
        .delete()
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId);

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Breakdown deleted successfully',
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findByStatus(userId: string, token: string, status?: string, siteId?: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!status) {
        return { success: false, message: 'status is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      let query = userSupabase
        .from('breakdowns')
        .select('*')
        .eq('status', status)
        .eq('organization_id', orgContext.organizationId);

      if (siteId) {
        query = query.eq('site_id', siteId);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findByPriority(userId: string, token: string, priority?: string, siteId?: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!priority) {
        return { success: false, message: 'priority is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      let query = userSupabase
        .from('breakdowns')
        .select('*')
        .eq('priority', priority)
        .eq('organization_id', orgContext.organizationId);

      if (siteId) {
        query = query.eq('site_id', siteId);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }
}
