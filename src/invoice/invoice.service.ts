import { Injectable } from '@nestjs/common';
import { FileService } from '../file/file.service';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { GenerateServiceQuotationDto } from './dto';
import { buildQuotationPdfBuffer } from './quotation-pdf';

/**
 * Billing documents: invoices and quotations.
 * Today: breakdown-service quotations. Later: AMC contracts, standalone invoices, etc.
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly fileService: FileService) {}
  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /** Same org resolution as breakdowns (owner or organization_members). */
  private async getOrganizationContext(
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

  private nextQuotationNumber(): string {
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `QT-${Date.now()}-${suffix}`;
  }

  /**
   * Creates a draft quotation row plus line items from service_parts / service_charges
   * for one breakdown_service, scoped by site_id for consistency checks.
   */
  async generateServiceQuotation(
    userId: string,
    token: string,
    payload: GenerateServiceQuotationDto,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const orgContext = await this.getOrganizationContext(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { organizationId } = orgContext;

      const { data: bsRow, error: bsError } = await userSupabase
        .from('breakdown_services')
        .select('id, breakdown_id, subtotal, discount, total')
        .eq('id', payload.breakdown_service_id)
        .single();

      if (bsError || !bsRow) {
        return {
          success: false,
          message: 'Breakdown service not found or not accessible',
        };
      }

      const breakdownId = bsRow.breakdown_id as string;

      const { data: breakdownRow, error: bdError } = await userSupabase
        .from('breakdowns')
        .select('id, site_id, organization_id')
        .eq('id', breakdownId)
        .single();

      if (bdError || !breakdownRow) {
        return { success: false, message: 'Breakdown not found or not accessible' };
      }

      if ((breakdownRow.organization_id as string) !== organizationId) {
        return { success: false, message: 'Breakdown does not belong to your organization' };
      }

      if ((breakdownRow.site_id as string) !== payload.site_id) {
        return {
          success: false,
          message: 'site_id does not match the breakdown for this breakdown service',
        };
      }

      const { data: siteRow, error: siteError } = await userSupabase
        .from('sites')
        .select('id, site_name, contact_person, phone, address')
        .eq('id', payload.site_id)
        .eq('organization_id', organizationId)
        .single();

      if (siteError || !siteRow) {
        return {
          success: false,
          message: 'Site not found or does not belong to your organization',
        };
      }

      const contactPerson = siteRow.contact_person as string | null | undefined;
      const siteName = siteRow.site_name as string | undefined;
      const customerName =
        contactPerson && String(contactPerson).trim() !== ''
          ? String(contactPerson).trim()
          : (siteName ?? 'Customer');

      const invoicePayload = {
        organization_id: organizationId,
        breakdown_id: breakdownId,
        site_id: payload.site_id,
        invoice_number: this.nextQuotationNumber(),
        type: 'quotation' as const,
        customer_name: customerName,
        customer_phone: (siteRow.phone as string | null) ?? null,
        customer_address: (siteRow.address as string | null) ?? null,
        subtotal: this.roundMoney(Number(bsRow.subtotal ?? 0)),
        discount: this.roundMoney(Number(bsRow.discount ?? 0)),
        tax: 0,
        total: this.roundMoney(Number(bsRow.total ?? 0)),
        created_by: userId,
      };

      const { data: invoiceRow, error: invError } = await userSupabase
        .from('invoices')
        .insert([invoicePayload])
        .select()
        .single();

      if (invError || !invoiceRow) {
        return {
          success: false,
          message: invError?.message || 'Failed to create quotation',
        };
      }

      const invoiceId = invoiceRow.id as string;

      const [{ data: partLines }, { data: chargeLines }] = await Promise.all([
        userSupabase
          .from('service_parts')
          .select('id, part_id, quantity, price, total')
          .eq('breakdown_service_id', payload.breakdown_service_id),
        userSupabase
          .from('service_charges')
          .select('id, title, quantity, price, total')
          .eq('breakdown_service_id', payload.breakdown_service_id),
      ]);

      const partIds = [...new Set((partLines ?? []).map((p) => (p as { part_id: string }).part_id))];
      const partMeta = new Map<string, { part_name: string; serial_number: string | null }>();
      if (partIds.length > 0) {
        const { data: partsRows, error: partsErr } = await userSupabase
          .from('parts')
          .select('id, part_name, serial_number')
          .in('id', partIds)
          .eq('organization_id', organizationId);

        if (partsErr) {
          await userSupabase.from('invoices').delete().eq('id', invoiceId);
          return { success: false, message: partsErr.message };
        }
        for (const p of partsRows ?? []) {
          const rec = p as { id: string; part_name: string; serial_number: string | null };
          partMeta.set(rec.id, {
            part_name: rec.part_name,
            serial_number: rec.serial_number ?? null,
          });
        }
      }

      const itemRows: Array<{
        invoice_id: string;
        title: string;
        description: string | null;
        quantity: number;
        price: number;
        total: number;
      }> = [];

      for (const line of partLines ?? []) {
        const rec = line as {
          part_id: string;
          quantity: number;
          price: number;
          total: number;
        };
        const meta = partMeta.get(rec.part_id);
        const title = meta?.part_name ?? 'Part';
        const serial = meta?.serial_number;
        const description =
          serial !== null && serial !== undefined && String(serial).trim() !== ''
            ? String(serial).trim()
            : null;
        itemRows.push({
          invoice_id: invoiceId,
          title,
          description,
          quantity: Number(rec.quantity ?? 1),
          price: this.roundMoney(Number(rec.price ?? 0)),
          total: this.roundMoney(Number(rec.total ?? 0)),
        });
      }

      for (const line of chargeLines ?? []) {
        const rec = line as { title: string; quantity: number; price: number; total: number };
        itemRows.push({
          invoice_id: invoiceId,
          title: rec.title,
          description: null,
          quantity: Number(rec.quantity ?? 1),
          price: this.roundMoney(Number(rec.price ?? 0)),
          total: this.roundMoney(Number(rec.total ?? 0)),
        });
      }

      if (itemRows.length > 0) {
        const { error: itemsError } = await userSupabase.from('invoice_items').insert(itemRows);
        if (itemsError) {
          await userSupabase.from('invoices').delete().eq('id', invoiceId);
          return { success: false, message: itemsError.message };
        }
      }

      const { data: itemsOut } = await userSupabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);

      const { data: orgRow } = await userSupabase
        .from('organizations')
        .select('company_name, logo, gst, pan, address, phone')
        .eq('id', organizationId)
        .single();

      let pdfObjectPath: string | undefined;
      let pdfError: string | undefined;
      let invoicePathPersistError: string | undefined;
      try {
        const pdfItems = (itemsOut ?? []).map((row) => {
          const r = row as {
            title: string;
            description: string | null;
            quantity: unknown;
            price: unknown;
            total: unknown;
          };
          return {
            title: r.title,
            description: r.description,
            quantity: Number(r.quantity ?? 0),
            price: this.roundMoney(Number(r.price ?? 0)),
            total: this.roundMoney(Number(r.total ?? 0)),
          };
        });

        const inv = invoiceRow as Record<string, unknown>;
        const pdfBuffer = await buildQuotationPdfBuffer({
          org: {
            company_name: (orgRow?.company_name as string) ?? null,
            logo: (orgRow?.logo as string) ?? null,
            gst: (orgRow?.gst as string) ?? null,
            pan: (orgRow?.pan as string) ?? null,
            address: (orgRow?.address as string) ?? null,
            phone: (orgRow?.phone as string) ?? null,
          },
          invoice: {
            invoice_number: String(inv.invoice_number ?? ''),
            type: String(inv.type ?? 'quotation'),
            customer_name: String(inv.customer_name ?? ''),
            customer_phone: (inv.customer_phone as string | null) ?? null,
            customer_address: (inv.customer_address as string | null) ?? null,
            subtotal: this.roundMoney(Number(inv.subtotal ?? 0)),
            discount: this.roundMoney(Number(inv.discount ?? 0)),
            tax: this.roundMoney(Number(inv.tax ?? 0)),
            total: this.roundMoney(Number(inv.total ?? 0)),
            created_at: (inv.created_at as string | null) ?? null,
          },
          items: pdfItems,
        });

        const pdfFileName = `quotation-${invoiceId}.pdf`;
        const uploadResult = await this.fileService.uploadPrivateBufferForOrgSite(
          token,
          organizationId,
          payload.site_id,
          pdfBuffer,
          pdfFileName,
        );
        if (uploadResult.success && uploadResult.data?.object_path) {
          pdfObjectPath = uploadResult.data.object_path;
          const { error: pathUpdErr } = await userSupabase
            .from('breakdown_services')
            .update({ invoice_path: pdfObjectPath })
            .eq('id', payload.breakdown_service_id);
          if (pathUpdErr) {
            invoicePathPersistError = pathUpdErr.message;
          }
        } else {
          pdfError = uploadResult.message || 'PDF upload failed';
        }
      } catch (e) {
        pdfError = e instanceof Error ? e.message : 'PDF generation failed';
      }

      return {
        success: true,
        message: 'Service quotation created',
        data: {
          ...invoiceRow,
          invoice_items: itemsOut ?? [],
          quotation_pdf_object_path: pdfObjectPath,
          ...(pdfError ? { quotation_pdf_error: pdfError } : {}),
          ...(invoicePathPersistError
            ? { invoice_path_persist_error: invoicePathPersistError }
            : {}),
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
