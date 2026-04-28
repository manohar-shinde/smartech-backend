import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import {
  AddBreakdownServiceDto,
  AddBreakdownServicePartDto,
  CreateBreakdownDto,
  UpdateBreakdownDto,
} from './dto';

@Injectable()
export class BreakdownService {
  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Deletes using the user JWT so RLS on service_charges / service_parts / breakdown_services
   * matches addBreakdownService (policies use auth.uid() via organization_members).
   */
  private async deleteBreakdownServiceAndChildren(
    userSupabase: ReturnType<typeof getUserSupabaseClient>,
    breakdownServiceId: string,
  ): Promise<void> {
    await userSupabase
      .from('service_charges')
      .delete()
      .eq('breakdown_service_id', breakdownServiceId);
    await userSupabase
      .from('service_parts')
      .delete()
      .eq('breakdown_service_id', breakdownServiceId);
    await userSupabase.from('breakdown_services').delete().eq('id', breakdownServiceId);
  }

  private sumPartQuantities(lines: AddBreakdownServicePartDto[]): Map<string, number> {
    const demand = new Map<string, number>();
    for (const line of lines) {
      demand.set(line.part_id, (demand.get(line.part_id) ?? 0) + line.quantity);
    }
    return demand;
  }

  private async assertStockAvailableForParts(
    partIds: string[],
    demandByPartId: Map<string, number>,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (partIds.length === 0) {
      return { ok: true };
    }

    const { data: stockRows, error } = await supabase
      .from('stock')
      .select('part_id, quantity')
      .in('part_id', partIds);

    if (error) {
      return { ok: false, message: error.message };
    }

    const haveByPart = new Map<string, number>();
    for (const row of stockRows ?? []) {
      const r = row as { part_id: string; quantity: number | string | null };
      if (!r.part_id) continue;
      const q = r.quantity;
      haveByPart.set(r.part_id, q === null || q === undefined ? 0 : Number(q));
    }

    for (const partId of partIds) {
      const need = demandByPartId.get(partId) ?? 0;
      const have = haveByPart.get(partId) ?? 0;
      if (need > have) {
        return {
          ok: false,
          message: `Insufficient stock for part ${partId}: need ${need}, available ${have}`,
        };
      }
    }

    return { ok: true };
  }

  /** Service-role Supabase client: same approach as part creation for `stock_movements` / RLS. */
  private async insertStockMovementsOutForBreakdownService(params: {
    serviceId: string;
    serviceName: string;
    breakdownId: string;
    breakdownServiceId: string;
    lines: AddBreakdownServicePartDto[];
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!params.lines.length) {
      return { ok: true };
    }

    const baseNote = `OUT - catalog service "${params.serviceName}" (reference services/${params.serviceId}); breakdown ${params.breakdownId}; breakdown_service_id=${params.breakdownServiceId}`;

    const insertRows = params.lines.map((line) => ({
      part_id: line.part_id,
      type: 'OUT',
      quantity: line.quantity,
      reference_type: 'services',
      reference_id: params.serviceId,
      notes: `${baseNote}; part_id=${line.part_id}; qty=${line.quantity}`,
    }));

    const { error } = await supabase.from('stock_movements').insert(insertRows);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  /**
   * RLS on breakdowns requires organization_members. Owners are resolved via
   * organizations; everyone else via organization_members (same org as parts).
   */
  private async getOrganizationContextForBreakdowns(
    userId: string,
  ): Promise<{ success: boolean; organizationId?: string; message?: string }> {
    try {
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const { data: ownedOrgs, error: ownedError } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (ownedError) {
        return { success: false, message: ownedError.message };
      }

      const ownedId = ownedOrgs?.[0]?.id as string | undefined;
      if (ownedId) {
        return { success: true, organizationId: ownedId };
      }

      const { data: membership, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memberError) {
        return { success: false, message: memberError.message };
      }

      const organizationId = membership?.organization_id as string | undefined;
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

  async createBreakdown(userId: string, token: string, payload: CreateBreakdownDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!payload?.site_id) {
        return { success: false, message: 'site_id is required' };
      }

      if (!payload?.title) {
        return { success: false, message: 'title is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);

      const { data: siteData, error: siteError } = await userSupabase
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

      const { data, error } = await userSupabase
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

  async addBreakdownService(userId: string, token: string, payload: AddBreakdownServiceDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);

      const { data: breakdown, error: breakdownError } = await userSupabase
        .from('breakdowns')
        .select('id, site_id, organization_id')
        .eq('id', payload.breakdown_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (breakdownError) {
        return { success: false, message: breakdownError.message };
      }
      if (!breakdown) {
        return { success: false, message: 'Breakdown not found' };
      }

      if (payload.site_id && breakdown.site_id !== payload.site_id) {
        return {
          success: false,
          message: 'site_id does not match the breakdown site',
        };
      }

      const { data: catalogService, error: serviceError } = await userSupabase
        .from('services')
        .select('id, name')
        .eq('id', payload.service_id)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (serviceError) {
        return { success: false, message: serviceError.message };
      }
      if (!catalogService) {
        return {
          success: false,
          message: 'Service not found or does not belong to your organization',
        };
      }

      const catalogServiceName =
        catalogService.name !== undefined &&
        catalogService.name !== null &&
        String(catalogService.name).trim() !== ''
          ? String(catalogService.name).trim()
          : 'Service';

      const partIds = [...new Set((payload.service_parts || []).map((p) => p.part_id))];
      if (partIds.length > 0) {
        const { data: validParts, error: partsLookupError } = await userSupabase
          .from('parts')
          .select('id')
          .in('id', partIds)
          .eq('organization_id', orgContext.organizationId);

        if (partsLookupError) {
          return { success: false, message: partsLookupError.message };
        }
        if (!validParts || validParts.length !== partIds.length) {
          return {
            success: false,
            message: 'One or more parts were not found or do not belong to your organization',
          };
        }
      }

      if (payload.service_parts?.length) {
        const demandByPart = this.sumPartQuantities(payload.service_parts);
        const stockCheck = await this.assertStockAvailableForParts(partIds, demandByPart);
        if (!stockCheck.ok) {
          return { success: false, message: stockCheck.message };
        }
      }

      let notes: string | null =
        payload.notes !== undefined && String(payload.notes).trim() !== ''
          ? String(payload.notes)
          : null;
      if (payload.discount_percent > 0) {
        const tag = `[discount ${payload.discount_percent}%]`;
        notes = notes ? `${notes} ${tag}` : tag;
      }

      const breakdownServiceRow = {
        breakdown_id: payload.breakdown_id,
        service_id: payload.service_id,
        notes,
        total: this.roundMoney(payload.total_cost),
        discount: this.roundMoney(payload.discount_amount),
        subtotal: this.roundMoney(payload.subtotal),
      };

      const { data: breakdownService, error: bsError } = await userSupabase
        .from('breakdown_services')
        .insert([breakdownServiceRow])
        .select('id')
        .single();

      if (bsError || !breakdownService?.id) {
        return {
          success: false,
          message: bsError?.message || 'Failed to create breakdown service',
        };
      }

      const breakdownServiceId = breakdownService.id as string;

      if (payload.service_parts?.length) {
        const partRows = payload.service_parts.map((p) => {
          const qty = p.quantity;
          const total = this.roundMoney(
            p.total !== undefined && p.total !== null ? p.total : p.price * qty,
          );
          return {
            breakdown_service_id: breakdownServiceId,
            part_id: p.part_id,
            quantity: qty,
            price: this.roundMoney(p.price),
            discount: this.roundMoney(p.discount),
            total,
          };
        });

        const { error: partsInsertError } = await userSupabase
          .from('service_parts')
          .insert(partRows);

        if (partsInsertError) {
          await this.deleteBreakdownServiceAndChildren(userSupabase, breakdownServiceId);
          return { success: false, message: partsInsertError.message };
        }
      }

      const chargeRows: Array<{
        breakdown_service_id: string;
        title: string;
        price: number;
        quantity: number;
        total: number;
      }> = [];

      for (const line of payload.service_charges || []) {
        const qty = line.quantity ?? 1;
        const total = this.roundMoney(
          line.total !== undefined && line.total !== null
            ? line.total
            : line.price * qty,
        );
        chargeRows.push({
          breakdown_service_id: breakdownServiceId,
          title: line.title,
          price: this.roundMoney(line.price),
          quantity: qty,
          total,
        });
      }

      if (payload.service_charge > 0) {
        chargeRows.push({
          breakdown_service_id: breakdownServiceId,
          title: 'Service charge',
          price: this.roundMoney(payload.service_charge),
          quantity: 1,
          total: this.roundMoney(payload.service_charge),
        });
      }

      if (chargeRows.length > 0) {
        const { error: chargesError } = await userSupabase
          .from('service_charges')
          .insert(chargeRows);

        if (chargesError) {
          await this.deleteBreakdownServiceAndChildren(userSupabase, breakdownServiceId);
          return { success: false, message: chargesError.message };
        }
      }

      if (payload.service_parts?.length) {
        const stockOut = await this.insertStockMovementsOutForBreakdownService({
          serviceId: payload.service_id,
          serviceName: catalogServiceName,
          breakdownId: payload.breakdown_id,
          breakdownServiceId,
          lines: payload.service_parts,
        });
        if (!stockOut.ok) {
          await this.deleteBreakdownServiceAndChildren(userSupabase, breakdownServiceId);
          return { success: false, message: stockOut.message };
        }
      }

      const [{ data: bsRow, error: bsFetchErr }, { data: partsRows }, { data: chargesRows }] =
        await Promise.all([
          userSupabase.from('breakdown_services').select('*').eq('id', breakdownServiceId).single(),
          userSupabase
            .from('service_parts')
            .select('*')
            .eq('breakdown_service_id', breakdownServiceId),
          userSupabase
            .from('service_charges')
            .select('*')
            .eq('breakdown_service_id', breakdownServiceId),
        ]);

      if (bsFetchErr || !bsRow) {
        return {
          success: true,
          message: 'Breakdown service added successfully',
          data: { id: breakdownServiceId },
        };
      }

      return {
        success: true,
        message: 'Breakdown service added successfully',
        data: {
          ...bsRow,
          service_parts: partsRows ?? [],
          service_charges: chargesRows ?? [],
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async findServicesForBreakdown(userId: string, token: string, breakdownId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }
      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);

      const { data: breakdown, error: breakdownError } = await userSupabase
        .from('breakdowns')
        .select('id')
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId)
        .maybeSingle();

      if (breakdownError) {
        return { success: false, message: breakdownError.message };
      }
      if (!breakdown) {
        return { success: false, message: 'Breakdown not found' };
      }

      // 1) breakdown_services — only columns exposed in API
      const breakdownServiceSelect =
        'id, breakdown_id, service_id, notes, total, status, created_at, discount, subtotal, invoice_path';
      const { data: breakdownServiceRows, error: bsError } = await userSupabase
        .from('breakdown_services')
        .select(breakdownServiceSelect)
        .eq('breakdown_id', breakdownId)
        .order('created_at', { ascending: false });

      if (bsError) {
        return { success: false, message: bsError.message };
      }

      const rows = breakdownServiceRows ?? [];
      if (rows.length === 0) {
        return {
          success: true,
          message: 'Breakdown services retrieved successfully',
          data: [],
        };
      }

      const breakdownServiceIds = rows.map((r: { id: string }) => r.id);
      const serviceIds = [...new Set(rows.map((r: { service_id: string }) => r.service_id))];

      // 2) services — id only for join; response keeps name, description, service_type, is_amc
      const { data: serviceRows, error: servicesError } = await userSupabase
        .from('services')
        .select('id, name, description, service_type, is_amc')
        .in('id', serviceIds)
        .eq('organization_id', orgContext.organizationId);

      if (servicesError) {
        return { success: false, message: servicesError.message };
      }

      const serviceById = new Map<
        string,
        { name: unknown; description: unknown; service_type: unknown; is_amc: unknown }
      >();
      for (const s of serviceRows ?? []) {
        const rec = s as {
          id: string;
          name: unknown;
          description: unknown;
          service_type: unknown;
          is_amc: unknown;
        };
        serviceById.set(rec.id, {
          name: rec.name,
          description: rec.description,
          service_type: rec.service_type,
          is_amc: rec.is_amc,
        });
      }

      // 3) service_charges — breakdown_service_id only for grouping (stripped in payload)
      const { data: chargeRows, error: chargesError } = await userSupabase
        .from('service_charges')
        .select('id, title, price, quantity, total, created_at, breakdown_service_id')
        .in('breakdown_service_id', breakdownServiceIds)
        .order('created_at', { ascending: true });

      if (chargesError) {
        return { success: false, message: chargesError.message };
      }

      type ChargeOut = {
        id: unknown;
        title: unknown;
        price: unknown;
        quantity: unknown;
        total: unknown;
        created_at: unknown;
      };
      const chargesByBreakdownServiceId = new Map<string, ChargeOut[]>();
      for (const c of chargeRows ?? []) {
        const rec = c as Record<string, unknown> & { breakdown_service_id: string };
        const out: ChargeOut = {
          id: rec.id,
          title: rec.title,
          price: rec.price,
          quantity: rec.quantity,
          total: rec.total,
          created_at: rec.created_at,
        };
        const list = chargesByBreakdownServiceId.get(rec.breakdown_service_id) ?? [];
        list.push(out);
        chargesByBreakdownServiceId.set(rec.breakdown_service_id, list);
      }

      // 4) service_parts — same pattern; nested part from parts table (limited columns)
      const { data: servicePartRows, error: spError } = await userSupabase
        .from('service_parts')
        .select(
          'id, part_id, quantity, price, discount, total, created_at, breakdown_service_id',
        )
        .in('breakdown_service_id', breakdownServiceIds)
        .order('created_at', { ascending: true });

      if (spError) {
        return { success: false, message: spError.message };
      }

      const partIds = [
        ...new Set(
          (servicePartRows ?? []).map((p) => (p as { part_id: string }).part_id),
        ),
      ];

      const partById = new Map<
        string,
        {
          part_name: unknown;
          sku: unknown;
          description: unknown;
          serial_number: unknown;
        }
      >();
      if (partIds.length > 0) {
        const { data: inventoryParts, error: partsError } = await userSupabase
          .from('parts')
          .select('id, part_name, sku, description, serial_number')
          .in('id', partIds)
          .eq('organization_id', orgContext.organizationId);

        if (partsError) {
          return { success: false, message: partsError.message };
        }
        for (const p of inventoryParts ?? []) {
          const rec = p as {
            id: string;
            part_name: unknown;
            sku: unknown;
            description: unknown;
            serial_number: unknown;
          };
          partById.set(rec.id, {
            part_name: rec.part_name,
            sku: rec.sku,
            description: rec.description,
            serial_number: rec.serial_number,
          });
        }
      }

      type PartLineOut = {
        id: unknown;
        part_id: unknown;
        quantity: unknown;
        price: unknown;
        discount: unknown;
        total: unknown;
        created_at: unknown;
        part: {
          part_name: unknown;
          sku: unknown;
          description: unknown;
          serial_number: unknown;
        } | null;
      };
      const partsByBreakdownServiceId = new Map<string, PartLineOut[]>();
      for (const line of servicePartRows ?? []) {
        const rec = line as Record<string, unknown> & {
          breakdown_service_id: string;
          part_id: string;
        };
        const part = partById.get(rec.part_id) ?? null;
        const out: PartLineOut = {
          id: rec.id,
          part_id: rec.part_id,
          quantity: rec.quantity,
          price: rec.price,
          discount: rec.discount,
          total: rec.total,
          created_at: rec.created_at,
          part,
        };
        const list = partsByBreakdownServiceId.get(rec.breakdown_service_id) ?? [];
        list.push(out);
        partsByBreakdownServiceId.set(rec.breakdown_service_id, list);
      }

      const sortByCreatedAt = <
        T extends { created_at?: unknown },
      >(a: T, b: T) => {
        const ta = (a.created_at as string) || '';
        const tb = (b.created_at as string) || '';
        return ta.localeCompare(tb);
      };
      for (const list of chargesByBreakdownServiceId.values()) {
        list.sort(sortByCreatedAt);
      }
      for (const list of partsByBreakdownServiceId.values()) {
        list.sort(sortByCreatedAt);
      }

      const data = rows.map((row: Record<string, unknown> & { id: string; service_id: string }) => ({
        id: row.id,
        breakdown_id: row.breakdown_id,
        service_id: row.service_id,
        notes: row.notes,
        total: row.total,
        status: row.status,
        created_at: row.created_at,
        discount: row.discount,
        subtotal: row.subtotal,
        invoice_path: row.invoice_path,
        service: serviceById.get(row.service_id) ?? null,
        service_charges: chargesByBreakdownServiceId.get(row.id) ?? [],
        service_parts: partsByBreakdownServiceId.get(row.id) ?? [],
      }));

      return {
        success: true,
        message: 'Breakdown services retrieved successfully',
        data,
      };
    } catch {
      return { success: false, message: 'Server error' };
    }
  }

  async findAllForSite(userId: string, token: string, siteId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!siteId) {
        return { success: false, message: 'Site ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .select('*')
        .eq('site_id', siteId)
        .eq('organization_id', orgContext.organizationId)
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

  async findBreakdownById(userId: string, token: string, breakdownId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .select('*')
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId)
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
    token: string,
    breakdownId: string,
    payload: UpdateBreakdownDto,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const updatePayload = {
        ...payload,
        updated_at: new Date().toISOString(),
      };

      const userSupabase = getUserSupabaseClient(token);
      const { data, error } = await userSupabase
        .from('breakdowns')
        .update(updatePayload)
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId)
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

  async deleteBreakdown(userId: string, token: string, breakdownId: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!breakdownId) {
        return { success: false, message: 'Breakdown ID is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { error } = await userSupabase
        .from('breakdowns')
        .delete()
        .eq('id', breakdownId)
        .eq('organization_id', orgContext.organizationId);

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

  async findByStatus(userId: string, token: string, status?: string, siteId?: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!status) {
        return { success: false, message: 'status is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      let query = userSupabase
        .from('breakdowns')
        .select('*')
        .eq('status', status)
        .eq('organization_id', orgContext.organizationId);

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

  async findByPriority(userId: string, token: string, priority?: string, siteId?: string) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      if (!priority) {
        return { success: false, message: 'priority is required' };
      }

      const orgContext = await this.getOrganizationContextForBreakdowns(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      let query = userSupabase
        .from('breakdowns')
        .select('*')
        .eq('priority', priority)
        .eq('organization_id', orgContext.organizationId);

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
