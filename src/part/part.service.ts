import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartStockDto } from './dto/update-part-stock.dto';

@Injectable()
export class PartService {
  private roundQty(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

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

      if ((payload.quantity ?? 0) <= 0) {
        return {
          success: false,
          message: 'quantity is required and must be greater than 0',
        };
      }

      // Use service-role client so inserts/rollback match org resolution (service role)
      // and are not split by RLS (user JWT can allow stock_movements but block parts or delete).
      const { data, error } = await supabase
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

      if (!data?.id) {
        return {
          success: false,
          message: 'Part insert did not return an id; check parts table policies and triggers.',
        };
      }

      const movementType = 'IN';
      const { error: stockMovementError } = await supabase
        .from('stock_movements')
        .insert([
          {
            part_id: data.id,
            type: movementType,
            quantity: payload.quantity,
            notes: 'Initial stock upadate',
          },
        ]);

      if (stockMovementError) {
        const { error: rollbackError } = await supabase
          .from('parts')
          .delete()
          .eq('id', data.id);

        return {
          success: false,
          message: rollbackError
            ? `${stockMovementError.message}. Rollback failed: ${rollbackError.message}`
            : stockMovementError.message.includes('stock_movement_type')
              ? `${stockMovementError.message}. Please update DB trigger/function to use uppercase enum values ('IN'/'OUT'/'ADJUSTMENT').`
              : stockMovementError.message,
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

  /**
   * Adds to on-hand stock by inserting one `IN` movement (`quantity` is added to whatever
   * was already in `stock` once the trigger runs).
   */
  async updateStockForOwner(ownerUserId: string, token: string, payload: UpdatePartStockDto) {
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

      const addRaw = Number(payload.quantity);
      if (!Number.isFinite(addRaw) || addRaw <= 0) {
        return { success: false, message: 'quantity must be a finite number greater than 0' };
      }
      const addQty = this.roundQty(addRaw);

      const { data: part, error: partError } = await supabase
        .from('parts')
        .select('id')
        .eq('id', payload.part_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (partError) {
        return { success: false, message: partError.message };
      }
      if (!part?.id) {
        return { success: false, message: 'Part not found' };
      }

      const { data: stockRow, error: stockReadError } = await supabase
        .from('stock')
        .select('part_id, quantity')
        .eq('part_id', payload.part_id)
        .maybeSingle();

      if (stockReadError) {
        return { success: false, message: stockReadError.message };
      }

      const rawCurrent = (stockRow as { quantity?: number | string | null } | null)?.quantity;
      const previous =
        rawCurrent === null || rawCurrent === undefined ? 0 : this.roundQty(Number(rawCurrent));

      const notePrefix = `Stock IN +${addQty} (previous on-hand ${previous})`;
      const extra =
        payload.notes !== undefined &&
        payload.notes !== null &&
        String(payload.notes).trim() !== ''
          ? `. ${String(payload.notes).trim()}`
          : '';
      const notes = `${notePrefix}${extra}`;

      const { error: movementError } = await supabase.from('stock_movements').insert([
        {
          part_id: payload.part_id,
          type: 'IN',
          quantity: addQty,
          reference_type: null,
          reference_id: null,
          notes,
        },
      ]);

      if (movementError) {
        return {
          success: false,
          message: movementError.message,
        };
      }

      const { data: updatedStock, error: stockAgainError } = await supabase
        .from('stock')
        .select('part_id, quantity')
        .eq('part_id', payload.part_id)
        .maybeSingle();

      if (stockAgainError) {
        return {
          success: true,
          message: 'Stock movement recorded; could not re-read stock row',
          data: { part_id: payload.part_id, added: addQty },
        };
      }

      const q = (updatedStock as { quantity?: number | string | null } | null)?.quantity;
      const quantityAfter =
        q === null || q === undefined
          ? this.roundQty(previous + addQty)
          : this.roundQty(Number(q));

      return {
        success: true,
        message: 'Stock updated successfully',
        data: {
          part_id: payload.part_id,
          added: addQty,
          quantity: quantityAfter,
        },
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

      const { data: parts, error } = await supabase
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

      const partList = parts ?? [];
      const partIds = partList.map((p: { id: string }) => p.id).filter(Boolean);

      const stockByPartId = new Map<string, number>();
      if (partIds.length > 0) {
        const { data: stockRows, error: stockError } = await supabase
          .from('stock')
          .select('part_id, quantity')
          .in('part_id', partIds);

        if (stockError) {
          return {
            success: false,
            message: stockError.message,
          };
        }

        for (const row of stockRows ?? []) {
          const r = row as { part_id: string; quantity: number | string | null };
          if (r.part_id) {
            const q = r.quantity;
            stockByPartId.set(
              r.part_id,
              q === null || q === undefined ? 0 : Number(q),
            );
          }
        }
      }

      const formattedData = partList.map((part: Record<string, unknown> & { id: string }) => ({
        ...part,
        quantity: stockByPartId.get(part.id) ?? 0,
      }));

      return {
        success: true,
        message: 'Parts fetched successfully',
        data: formattedData,
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
