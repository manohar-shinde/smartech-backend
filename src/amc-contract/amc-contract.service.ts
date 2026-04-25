import { Injectable } from '@nestjs/common';
import { supabase } from 'src/supabase/supabase.client';
import { CreateAmcContractDto } from './dto/create-amc-contract.dto';
import { UpdateAmcContractDto } from './dto/update-amc-contract.dto';
import { RenewAmcContractDto } from './dto/renew-amc-contract.dto';

type OrgContextOk = { success: true; organizationId: string };
type OrgContextErr = { success: false; message: string };

type FindOneOk = { success: true; data: Record<string, unknown> };
type FindOneErr = { success: false; message: string };

@Injectable()
export class AmcContractService {
  private async getOrganizationIdForOwner(
    userId: string,
  ): Promise<OrgContextOk | OrgContextErr> {
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return { success: false, message: error.message };
    }

    const organizationId = organizations?.[0]?.id as string | undefined;
    if (!organizationId) {
      return {
        success: false,
        message: 'Organization not found for this user',
      };
    }

    return { success: true as const, organizationId };
  }

  private async validateSiteInOrganization(siteId: string, organizationId: string) {
    const { data: site, error } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !site) {
      return {
        success: false,
        message: 'Site not found in your organization',
      };
    }

    return { success: true };
  }

  private isInvalidDateRange(startDate: string, endDate: string) {
    return new Date(endDate).getTime() <= new Date(startDate).getTime();
  }

  async createForSite(userId: string, siteId: string, payload: CreateAmcContractDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!siteId) {
        return { success: false, message: 'Site ID is required' };
      }
      if (this.isInvalidDateRange(payload.start_date, payload.end_date)) {
        return { success: false, message: 'end_date must be after start_date' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }
      const { organizationId } = orgContext;

      const siteValidation = await this.validateSiteInOrganization(
        siteId,
        organizationId,
      );
      if (!siteValidation.success) {
        return siteValidation;
      }

      const { data, error } = await supabase
        .from('amc_contracts')
        .insert([
          {
            site_id: siteId,
            organization_id: organizationId,
            start_date: payload.start_date,
            end_date: payload.end_date,
            status: payload.status || 'active',
            notes: payload.notes || null,
          },
        ])
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'AMC contract created successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async listForSite(userId: string, siteId: string) {
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
      const { organizationId } = orgContext;

      const siteValidation = await this.validateSiteInOrganization(
        siteId,
        organizationId,
      );
      if (!siteValidation.success) {
        return siteValidation;
      }

      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('site_id', siteId)
        .order('start_date', { ascending: false });

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

  async findOne(
    userId: string,
    contractId: string,
  ): Promise<FindOneOk | FindOneErr> {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!contractId) {
        return { success: false, message: 'Contract ID is required' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }
      const { organizationId } = orgContext;

      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*')
        .eq('id', contractId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        return { success: false, message: error.message };
      }
      if (!data) {
        return { success: false, message: 'AMC contract not found' };
      }

      return {
        success: true as const,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async update(userId: string, contractId: string, payload: UpdateAmcContractDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!contractId) {
        return { success: false, message: 'Contract ID is required' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }
      const { organizationId } = orgContext;

      const current = await this.findOne(userId, contractId);
      if (!current.success) {
        return current;
      }

      const startDate =
        payload.start_date || String(current.data.start_date);
      const endDate = payload.end_date || String(current.data.end_date);
      if (this.isInvalidDateRange(startDate, endDate)) {
        return { success: false, message: 'end_date must be after start_date' };
      }

      const { data, error } = await supabase
        .from('amc_contracts')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contractId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'AMC contract updated successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async renew(userId: string, contractId: string, payload: RenewAmcContractDto) {
    try {
      const current = await this.findOne(userId, contractId);
      if (!current.success) {
        return current;
      }

      const previous = current.data as {
        site_id: string;
        end_date: string;
      };
      const startDate =
        payload.start_date ||
        new Date(new Date(previous.end_date).getTime() + 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

      if (this.isInvalidDateRange(startDate, payload.end_date)) {
        return { success: false, message: 'end_date must be after start_date' };
      }

      return this.createForSite(userId, previous.site_id, {
        site_id: previous.site_id,
        start_date: startDate,
        end_date: payload.end_date,
        notes: payload.notes,
        status: 'active',
      });
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async listExpiringSoon(userId: string, days = 30) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationIdForOwner(userId);
      if (!orgContext.success) {
        return orgContext;
      }
      const { organizationId } = orgContext;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + days);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*, sites (id, site_name, address, contact_person, email, phone)')
        .eq('organization_id', organizationId)
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
}
