import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { CreatePartDto } from './dto/create-part.dto';

@Injectable()
export class PartService {
  async createPartForOwner(ownerUserId: string, token: string, payload: CreatePartDto) {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Access token is required',
        };
      }

      const orgContext = await this.getOrganizationContextForParts(ownerUserId);

      if (!orgContext.success) {
        return orgContext;
      }

      if (!payload?.part_name) {
        return {
          success: false,
          message: 'part_name is required',
        };
      }

      if (!payload?.sku) {
        return {
          success: false,
          message: 'sku is required',
        };
      }

      if (
        (payload.cost_price !== undefined && payload.cost_price < 0) ||
        (payload.sell_price !== undefined && payload.sell_price < 0) ||
        (payload.quantity !== undefined && payload.quantity < 0)
      ) {
        return {
          success: false,
          message: 'cost_price, sell_price and quantity must be non-negative',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('parts')
        .insert([
          {
            organization_id: orgContext.organizationId,
            part_name: payload.part_name,
            sku: payload.sku,
            description: payload.description,
            cost_price: payload.cost_price ?? 0,
            sell_price: payload.sell_price ?? 0,
            image: payload.image,
            serial_number: payload.serial_number,
            quantity: payload.quantity ?? 0,
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
        message: 'Part created successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async findAllForOwner(ownerUserId: string) {
    try {
      const orgContext = await this.getOrganizationContextForParts(ownerUserId);

      if (!orgContext.success) {
        return orgContext;
      }

      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('organization_id', orgContext.organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'Parts fetched successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /**
   * Resolves org for parts APIs: owners via organizations.owner_id, or any user
   * listed in organization_members (matches parts_write_access RLS).
   */
  private async getOrganizationContextForParts(userId: string): Promise<any> {
    if (!userId) {
      return {
        success: false,
        message: 'User is not authenticated',
      };
    }

    const { data: ownedOrgs, error: ownedError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (ownedError) {
      return {
        success: false,
        message: ownedError.message,
      };
    }

    const ownedId = ownedOrgs?.[0]?.id as string | undefined;
    if (ownedId) {
      return {
        success: true,
        organizationId: ownedId,
      };
    }

    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      return {
        success: false,
        message: memberError.message,
      };
    }

    const organizationId = membership?.organization_id as string | undefined;
    if (!organizationId) {
      return {
        success: false,
        message: 'Organization not found for this user',
      };
    }

    return {
      success: true,
      organizationId,
    };
  }
}
