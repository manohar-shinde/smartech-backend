import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SitesService {
  async createSiteForUser(userId: string, payload: CreateSiteDto) {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!payload?.site_name) {
        return { success: false, message: 'site_name is required' };
      }

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

      const sitePayload = {
        owner_id: userId,
        organization_id: organizationId,
        site_name: payload.site_name,
        address: payload.address,
        contact_person: payload.contact_person,
        email: payload.email,
        phone: payload.phone,
        amc_start_date: payload.amc_start_date,
        amc_end_date: payload.amc_end_date,
        amount_received: payload.amount_received,
        transactions_details: payload.transactions_details,
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

      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('owner_id', userId);

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

      // Calculate date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + days);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('owner_id', userId)
        .gte('amc_end_date', todayStr)
        .lte('amc_end_date', expiryDateStr)
        .order('amc_end_date', { ascending: true });

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: `Found ${data?.length || 0} site(s) with AMC expiring within ${days} days`,
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }
}
