import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreatePartDto } from './dto/create-part.dto';

@Injectable()
export class PartService {
  async createPartForOwner(ownerUserId: string, payload: CreatePartDto) {
    try {
      const ownerContext = await this.getOwnerContext(ownerUserId);

      if (!ownerContext.success) {
        return ownerContext;
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

      const { data, error } = await supabase
        .from('parts')
        .insert([
          {
            organization_id: ownerContext.organizationId,
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
      const ownerContext = await this.getOwnerContext(ownerUserId);

      if (!ownerContext.success) {
        return ownerContext;
      }

      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('organization_id', ownerContext.organizationId)
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

  private async getOwnerContext(ownerUserId: string): Promise<any> {
    if (!ownerUserId) {
      return {
        success: false,
        message: 'User is not authenticated',
      };
    }

    const { data: ownerUser, error: ownerUserError } = await supabase
      .from('users')
      .select('role')
      .eq('id', ownerUserId)
      .single();

    if (ownerUserError) {
      return {
        success: false,
        message: ownerUserError.message,
      };
    }

    if (ownerUser?.role !== 'OWNER') {
      return {
        success: false,
        message: 'Only owner can manage parts',
      };
    }

    const { data: organizations, error: organizationError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (organizationError) {
      return {
        success: false,
        message: organizationError.message,
      };
    }

    const organizationId = organizations?.[0]?.id as string | undefined;

    if (!organizationId) {
      return {
        success: false,
        message: 'Organization not found for the logged-in owner',
      };
    }

    return {
      success: true,
      organizationId,
    };
  }
}
