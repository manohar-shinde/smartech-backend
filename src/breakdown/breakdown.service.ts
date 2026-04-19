import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreateBreakdownDto, UpdateBreakdownDto } from './dto';

@Injectable()
export class BreakdownService {
  private async getOrganizationIdForUser(
    userId: string,
  ): Promise<{ success: boolean; organizationId?: string; message?: string }> {
    try {
      const { data: existingOrganizations, error: existingOrgError } =
        await supabase
          .from('organizations')
          .select('id')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

      if (existingOrgError) {
        return { success: false, message: existingOrgError.message };
      }

      const organizationId = existingOrganizations?.[0]?.id as
        | string
        | undefined;

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

  async createBreakdown(userId: string, payload: CreateBreakdownDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!payload?.site_id) {
        return { success: false, message: 'site_id is required' };
      }

      if (!payload?.title) {
        return { success: false, message: 'title is required' };
      }

      const orgContext = await this.getOrganizationIdForUser(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      // Validate that the site belongs to the user's organization
      const { data: siteData, error: siteError } = await supabase
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

      const { data, error } = await supabase
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

  async findAllForSite(userId: string, siteId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!siteId) {
        return { success: false, message: 'Site ID is required' };
      }

      const { data, error } = await supabase
        .from('breakdowns')
        .select('*')
        .eq('site_id', siteId)
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

  async findBreakdownById(userId: string, breakdownId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const { data, error } = await supabase
        .from('breakdowns')
        .select('*')
        .eq('id', breakdownId)
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
    breakdownId: string,
    payload: UpdateBreakdownDto,
  ) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const updatePayload = {
        ...payload,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('breakdowns')
        .update(updatePayload)
        .eq('id', breakdownId)
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

  async deleteBreakdown(userId: string, breakdownId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const { error } = await supabase
        .from('breakdowns')
        .delete()
        .eq('id', breakdownId);

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

  async findByStatus(userId: string, status?: string, siteId?: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!status) {
        return { success: false, message: 'status is required' };
      }

      let query = supabase.from('breakdowns').select('*').eq('status', status);

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

  async findByPriority(userId: string, priority?: string, siteId?: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!priority) {
        return { success: false, message: 'priority is required' };
      }

      let query = supabase
        .from('breakdowns')
        .select('*')
        .eq('priority', priority);

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
