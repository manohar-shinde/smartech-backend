import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SiteService {
  private async getOrganizationIdForOwner(userId: string) {
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

    const organizationId = existingOrganizations?.[0]?.id as string | undefined;
    if (!organizationId) {
      return {
        success: false,
        message: 'Organization not found for this user',
      };
    }

    return { success: true, organizationId };
  }

  async createSiteForUser(userId: string, payload: CreateSiteDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!payload?.site_name) {
        return { success: false, message: 'site_name is required' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const sitePayload = {
        organization_id: orgContext.organizationId,
        site_name: payload.site_name,
        address: payload.address,
        contact_person: payload.contact_person,
        email: payload.email,
        phone: payload.phone,
      };

      const { data, error } = await supabase
        .from('sites')
        .insert([sitePayload])
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Site created successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findAllForUser(userId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('organization_id', orgContext.organizationId);

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

  async getAmcExpiringWithinDays(userId: string, days: number = 30) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + days);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*, sites (id, site_name, address, contact_person, email, phone)')
        .eq('organization_id', orgContext.organizationId)
        .gte('end_date', todayStr)
        .lte('end_date', expiryDateStr)
        .order('end_date', { ascending: true });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: `Found ${data?.length || 0} contract(s) expiring within ${days} day(s)`,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findSiteById(userId: string, siteId: string) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!siteId) {
        return { success: false, message: 'Site ID is required' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('id', siteId)
        .eq('organization_id', orgContext.organizationId)
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data) {
        return { success: false, message: 'Site not found' };
      }

      return {
        success: true,
        message: 'Site details retrieved successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }
}
