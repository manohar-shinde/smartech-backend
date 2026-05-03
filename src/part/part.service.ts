import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { UpdatePartStockDto } from './dto/update-part-stock.dto';
import { DeletePartDto } from './dto/delete-part.dto';
import { GetMonthlyPartSaleDto } from './dto/get-monthly-part-sale.dto';

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

      if (
        payload.cost_price === undefined ||
        payload.cost_price === null ||
        Number.isNaN(Number(payload.cost_price))
      ) {
        return {
          success: false,
          message: 'cost_price is required',
        };
      }

      if (
        payload.sell_price === undefined ||
        payload.sell_price === null ||
        Number.isNaN(Number(payload.sell_price))
      ) {
        return {
          success: false,
          message: 'sell_price is required',
        };
      }

      if (
        payload.quantity === undefined ||
        payload.quantity === null ||
        Number.isNaN(Number(payload.quantity))
      ) {
        return {
          success: false,
          message: 'quantity is required',
        };
      }

      if (
        payload.cost_price < 0 ||
        payload.sell_price < 0 ||
        payload.quantity < 0
      ) {
        return {
          success: false,
          message: 'cost_price, sell_price and quantity must be non-negative',
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
            sku: payload.sku ?? null,
            description: payload.description,
            cost_price: payload.cost_price,
            sell_price: payload.sell_price,
            image: payload.image,
            serial_number: payload.serial_number ?? null,
            is_deleted: false,
            deleted_at: null,
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

  async updatePartForOwner(ownerUserId: string, token: string, payload: UpdatePartDto) {
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

      if (
        payload.cost_price === undefined ||
        payload.cost_price === null ||
        Number.isNaN(Number(payload.cost_price))
      ) {
        return {
          success: false,
          message: 'cost_price is required',
        };
      }

      if (
        payload.sell_price === undefined ||
        payload.sell_price === null ||
        Number.isNaN(Number(payload.sell_price))
      ) {
        return {
          success: false,
          message: 'sell_price is required',
        };
      }

      if (payload.cost_price < 0 || payload.sell_price < 0) {
        return {
          success: false,
          message: 'cost_price and sell_price must be non-negative',
        };
      }

      const { data: existing, error: existingError } = await supabase
        .from('parts')
        .select('id')
        .eq('id', payload.part_id)
        .eq('organization_id', orgContext.organizationId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .maybeSingle();

      if (existingError) {
        return { success: false, message: existingError.message };
      }
      if (!existing?.id) {
        return { success: false, message: 'Part not found' };
      }

      const { data, error } = await supabase
        .from('parts')
        .update({
          part_name: payload.part_name,
          sku: payload.sku ?? null,
          description: payload.description,
          cost_price: payload.cost_price,
          sell_price: payload.sell_price,
          image: payload.image,
          serial_number: payload.serial_number ?? null,
        })
        .eq('id', payload.part_id)
        .eq('organization_id', orgContext.organizationId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      return {
        success: true,
        message: 'Part updated successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async softDeletePart(ownerUserId: string, payload: DeletePartDto) {
    try {
      const orgContext = await this.getOrganizationContextForParts(ownerUserId);
      if (!orgContext.success) {
        return orgContext;
      }

      const { data: part, error: partError } = await supabase
        .from('parts')
        .select('id, is_deleted')
        .eq('id', payload.part_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (partError) {
        return { success: false, message: partError.message };
      }
      if (!part?.id) {
        return { success: false, message: 'Part not found' };
      }

      const row = part as { id: string; is_deleted: boolean | null };
      if (row.is_deleted === true) {
        return {
          success: false,
          message: 'Part is already removed',
        };
      }

      const deletedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('parts')
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
        message: 'Part removed successfully',
        data: {
          part_id: row.id,
          is_deleted: true,
          deleted_at: deletedAt,
        },
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
        .or('is_deleted.eq.false,is_deleted.is.null')
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
        .or('is_deleted.eq.false,is_deleted.is.null')
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

  async getMonthlySaleForOwner(ownerUserId: string, token: string, payload: GetMonthlyPartSaleDto) {
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

      const [yearStr, monthStr] = payload.month.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);

      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return {
          success: false,
          message: 'month must be in YYYY-MM format',
        };
      }

      const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString();

      const { data: breakdownRows, error: breakdownError } = await supabase
        .from('breakdowns')
        .select('id, site_id')
        .eq('organization_id', orgContext.organizationId);

      if (breakdownError) {
        return { success: false, message: breakdownError.message };
      }

      const breakdownList =
        (breakdownRows as Array<{
          id: string;
          site_id: string | null;
        }> | null) ?? [];

      if (breakdownList.length === 0) {
        return {
          success: true,
          message: 'Monthly part sales fetched successfully',
          data: {
            summary: {
              total_quantity_sold: 0,
              grand_total: 0,
            },
            site_wise: [],
          },
        };
      }

      const breakdownIds = breakdownList.map((row) => row.id);
      const siteIds = Array.from(
        new Set(
          breakdownList
            .map((row) => row.site_id)
            .filter((siteId): siteId is string => typeof siteId === 'string' && siteId.length > 0),
        ),
      );

      const siteNameById = new Map<string, string>();
      if (siteIds.length > 0) {
        const { data: siteRows, error: siteError } = await supabase
          .from('sites')
          .select('id, site_name')
          .in('id', siteIds);

        if (siteError) {
          return { success: false, message: siteError.message };
        }

        for (const row of (siteRows as Array<{ id: string; site_name: string | null }> | null) ?? []) {
          siteNameById.set(row.id, row.site_name ?? 'Unknown Site');
        }
      }

      const siteByBreakdownId = new Map<string, string>();
      for (const row of breakdownList) {
        siteByBreakdownId.set(
          row.id,
          row.site_id ? (siteNameById.get(row.site_id) ?? 'Unknown Site') : 'Unknown Site',
        );
      }

      const { data: breakdownServiceRows, error: breakdownServiceError } = await supabase
        .from('breakdown_services')
        .select('id, breakdown_id')
        .in('breakdown_id', breakdownIds);

      if (breakdownServiceError) {
        return { success: false, message: breakdownServiceError.message };
      }

      const breakdownServiceList =
        (breakdownServiceRows as Array<{ id: string; breakdown_id: string }> | null) ?? [];

      if (breakdownServiceList.length === 0) {
        return {
          success: true,
          message: 'Monthly part sales fetched successfully',
          data: {
            summary: {
              total_quantity_sold: 0,
              grand_total: 0,
            },
            site_wise: [],
          },
        };
      }

      const breakdownServiceIds = breakdownServiceList.map((row) => row.id);
      const siteByBreakdownServiceId = new Map<string, string>();
      for (const row of breakdownServiceList) {
        siteByBreakdownServiceId.set(
          row.id,
          siteByBreakdownId.get(row.breakdown_id) ?? 'Unknown Site',
        );
      }

      const { data: servicePartRows, error: servicePartError } = await supabase
        .from('service_parts')
        .select('breakdown_service_id, quantity, total')
        .eq('part_id', payload.part_id)
        .gte('created_at', monthStart)
        .lt('created_at', nextMonthStart)
        .in('breakdown_service_id', breakdownServiceIds);

      if (servicePartError) {
        return { success: false, message: servicePartError.message };
      }

      const salesList =
        (servicePartRows as Array<{
          breakdown_service_id: string;
          quantity: number | string;
          total: number | string;
        }> | null) ?? [];

      const aggregate = new Map<string, { site_name: string; part_quantity: number; total: number }>();
      for (const row of salesList) {
        const siteName = siteByBreakdownServiceId.get(row.breakdown_service_id) ?? 'Unknown Site';
        const quantity = Number(row.quantity) || 0;
        const total = Number(row.total) || 0;
        const current = aggregate.get(siteName) ?? {
          site_name: siteName,
          part_quantity: 0,
          total: 0,
        };
        current.part_quantity += quantity;
        current.total += total;
        aggregate.set(siteName, current);
      }

      const siteWiseSales = Array.from(aggregate.values()).map((item) => ({
        site_name: item.site_name,
        part_quantity: item.part_quantity,
        total: Number(item.total.toFixed(2)),
      }));

      const summary = siteWiseSales.reduce(
        (acc, item) => {
          acc.total_quantity_sold += item.part_quantity;
          acc.grand_total += item.total;
          return acc;
        },
        { total_quantity_sold: 0, grand_total: 0 },
      );

      return {
        success: true,
        message: 'Monthly part sales fetched successfully',
        data: {
          summary: {
            total_quantity_sold: summary.total_quantity_sold,
            grand_total: Number(summary.grand_total.toFixed(2)),
          },
          site_wise: siteWiseSales,
        },
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
