import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Injectable()
export class OrganizationService {
  async createProfileForUser(userId: string, payload: UpsertOrganizationDto) {
    try {
      if (!userId) {
        return {
          success: false,
          message: 'User is not authenticated',
        };
      }

      if (!payload?.company_name) {
        return {
          success: false,
          message: 'company_name is required',
        };
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingError) {
        return {
          success: false,
          message: existingError.message,
        };
      }

      if (existingRows && existingRows.length > 0) {
        return {
          success: false,
          message: 'Company profile already exists for this user',
        };
      }

      const companyPayload = {
        logo: payload?.logo,
        company_name: payload?.company_name,
        address: payload?.address,
        contact_person: payload?.contact_person,
        phone: payload?.phone,
        email: payload?.email,
        gst: payload?.gst,
        pan: payload?.pan,
        site: payload?.site,
      };

      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            ...companyPayload,
            owner_id: userId,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'Company profile created successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async upsertForUser(userId: string, payload: UpsertOrganizationDto) {
    try {
      if (!userId) {
        return {
          success: false,
          message: 'User is not authenticated',
        };
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingError) {
        return {
          success: false,
          message: existingError.message,
        };
      }

      const existingId = existingRows?.[0]?.id as string | undefined;

      if (!existingId && !payload?.company_name) {
        return {
          success: false,
          message: 'company_name is required',
        };
      }

      const companyPayload = {
        logo: payload?.logo,
        company_name: payload?.company_name,
        address: payload?.address,
        contact_person: payload?.contact_person,
        phone: payload?.phone,
        email: payload?.email,
        gst: payload?.gst,
        pan: payload?.pan,
        site: payload?.site,
      };

      if (existingId) {
        const { data, error } = await supabase
          .from('organizations')
          .update(companyPayload)
          .eq('id', existingId)
          .select()
          .single();

        if (error) {
          return {
            success: false,
            message: error.message,
          };
        }

        return {
          success: true,
          message: 'Company details updated successfully',
          data,
        };
      }

      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            ...companyPayload,
            owner_id: userId,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'Company details saved successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async findForUser(userId: string) {
    try {
      if (!userId) {
        return {
          success: false,
          message: 'User is not authenticated',
        };
      }

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle();

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: data
          ? 'Company details fetched successfully'
          : 'Company details not found',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }
}
