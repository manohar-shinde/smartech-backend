import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreateSiteDto } from './dto/create-site.dto';
import { DeleteSiteDto } from './dto/delete-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

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
        location: payload.location,
        contact_person: payload.contact_person,
        email: payload.email,
        phone: payload.phone,
        is_deleted: false,
        deleted_at: null,
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

      const { data: sites, error } = await supabase
        .from('sites')
        .select('*')
        .eq('organization_id', orgContext.organizationId)
        .or('is_deleted.eq.false,is_deleted.is.null');

      if (error) {
        return { success: false, message: error.message };
      }

      const siteList = sites ?? [];
      if (siteList.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      const siteIds = siteList.map((s) => s.id as string);

      const { data: contracts, error: contractsError } = await supabase
        .from('amc_contracts')
        .select('site_id, end_date, contract_amount')
        .eq('organization_id', orgContext.organizationId)
        .in('site_id', siteIds)
        .order('created_at', { ascending: false });

      if (contractsError) {
        return { success: false, message: contractsError.message };
      }

      const latestAmcBySite = new Map<
        string,
        { end_date: string | null; contract_amount: number | null }
      >();
      for (const row of contracts ?? []) {
        const sid = row.site_id as string;
        if (!latestAmcBySite.has(sid)) {
          const rawAmount = row.contract_amount;
          latestAmcBySite.set(sid, {
            end_date: (row.end_date as string) ?? null,
            contract_amount:
              rawAmount != null ? Number(rawAmount) : null,
          });
        }
      }

      const data = siteList.map((site) => {
        const amc = latestAmcBySite.get(site.id as string);
        return {
          ...site,
          amc_expiry: amc?.end_date ?? null,
          amc_contract_amount: amc?.contract_amount ?? null,
        };
      });

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

      const { data: raw, error } = await supabase
        .from('amc_contracts')
        .select(
          '*, sites (id, site_name, address, location, contact_person, email, phone, is_deleted)',
        )
        .eq('organization_id', orgContext.organizationId)
        .gte('end_date', todayStr)
        .lte('end_date', expiryDateStr)
        .order('end_date', { ascending: true });

      if (error) {
        return { success: false, message: error.message };
      }

      const data = (raw ?? [])
        .filter((row: { sites?: { is_deleted?: boolean | null } }) => {
          const site = row.sites;
          if (!site || typeof site !== 'object') {
            return false;
          }
          return site.is_deleted !== true;
        })
        .map((row: { sites?: Record<string, unknown> }) => {
          const sites = row.sites;
          if (sites && typeof sites === 'object' && 'is_deleted' in sites) {
            const { is_deleted: _removed, ...siteFields } = sites;
            return { ...row, sites: siteFields };
          }
          return row;
        });

      return {
        success: true,
        message: `Found ${data.length} contract(s) expiring within ${days} day(s)`,
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
        .or('is_deleted.eq.false,is_deleted.is.null')
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data) {
        return { success: false, message: 'Site not found' };
      }

      const { data: latestContract, error: contractError } = await supabase
        .from('amc_contracts')
        .select('end_date, contract_amount')
        .eq('organization_id', orgContext.organizationId)
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contractError) {
        return { success: false, message: contractError.message };
      }

      const rawAmount = latestContract?.contract_amount;
      const amc_contract_amount =
        rawAmount != null ? Number(rawAmount) : null;

      return {
        success: true,
        message: 'Site details retrieved successfully',
        data: {
          ...data,
          amc_expiry: (latestContract?.end_date as string) ?? null,
          amc_contract_amount,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async updateSite(userId: string, payload: UpdateSiteDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const hasAnyField =
        payload.site_name !== undefined ||
        payload.address !== undefined ||
        payload.location !== undefined ||
        payload.contact_person !== undefined ||
        payload.email !== undefined ||
        payload.phone !== undefined;

      if (!hasAnyField) {
        return {
          success: false,
          message:
            'Provide at least one field to update (site_name, address, location, contact_person, email, phone)',
        };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('id, is_deleted')
        .eq('id', payload.site_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (siteError) {
        return { success: false, message: siteError.message };
      }
      if (!site?.id) {
        return { success: false, message: 'Site not found' };
      }

      const row = site as { id: string; is_deleted: boolean | null };
      if (row.is_deleted === true) {
        return {
          success: false,
          message: 'Cannot update a removed site',
        };
      }

      const updates: Record<string, string | null> = {};

      if (payload.site_name !== undefined) {
        const name = payload.site_name.trim();
        if (name.length === 0) {
          return { success: false, message: 'site_name cannot be empty' };
        }
        updates.site_name = name;
      }

      if (payload.address !== undefined) {
        const v = payload.address.trim();
        updates.address = v.length > 0 ? v : null;
      }

      if (payload.location !== undefined) {
        const v = payload.location.trim();
        updates.location = v.length > 0 ? v : null;
      }

      if (payload.contact_person !== undefined) {
        const v = payload.contact_person.trim();
        updates.contact_person = v.length > 0 ? v : null;
      }

      if (payload.email !== undefined) {
        const v = payload.email?.trim() ?? '';
        updates.email = v.length > 0 ? v.toLowerCase() : null;
      }

      if (payload.phone !== undefined) {
        const v = payload.phone.trim();
        if (v.length === 0) {
          return { success: false, message: 'phone cannot be empty when provided' };
        }
        updates.phone = v;
      }

      const { data, error: updateError } = await supabase
        .from('sites')
        .update(updates)
        .eq('id', row.id)
        .eq('organization_id', orgContext.organizationId)
        .select()
        .single();

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      return {
        success: true,
        message: 'Site updated successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async softDeleteSite(userId: string, payload: DeleteSiteDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }

      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('id, is_deleted')
        .eq('id', payload.site_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (siteError) {
        return { success: false, message: siteError.message };
      }
      if (!site?.id) {
        return { success: false, message: 'Site not found' };
      }

      const row = site as { id: string; is_deleted: boolean | null };
      if (row.is_deleted === true) {
        return {
          success: false,
          message: 'Site is already removed',
        };
      }

      const deletedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('sites')
        .update({
          is_deleted: true,
          deleted_at: deletedAt,
        })
        .eq('id', row.id)
        .eq('organization_id', orgContext.organizationId);

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      return {
        success: true,
        message: 'Site removed successfully',
        data: {
          site_id: row.id,
          is_deleted: true,
          deleted_at: deletedAt,
        },
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }
}
