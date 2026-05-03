import { Injectable } from '@nestjs/common';
import {
  buildQuotationNumber,
  isUniqueConstraintViolation,
  withDocumentNumberDisambiguator,
} from '../common/document-number.util.js';
import { FileService } from '../file/file.service.js';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client.js';
import { GenerateServiceQuotationDto, UpdateQuotationStatusDto } from './dto/index.js';
import { buildQuotationPdfBuffer } from './quotation-pdf.js';

/**
 * Service quotations persisted in `quotations` / `quotation_items` (breakdown-scoped).
 */
@Injectable()
export class QuotationService {
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

  /** `valid_until` date (YYYY-MM-DD): 15 calendar days from now (UTC). */
  private quotationValidUntilIsoDate(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 15);
    return d.toISOString().slice(0, 10);
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
        .select(
          'id, breakdown_id, subtotal, discount_amount, discount_percentage, tax_amount, tax_percentage, total',
        )
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

      const taxAmount = this.roundMoney(Number(bsRow.tax_amount ?? 0));
      const discountAmount = this.roundMoney(Number(bsRow.discount_amount ?? 0));
      const taxPctRaw = bsRow.tax_percentage;
      const discountPctRaw = bsRow.discount_percentage;
      const tax_percentage =
        taxPctRaw === null || taxPctRaw === undefined ? 0 : Number(taxPctRaw);
      const discount_percentage =
        discountPctRaw === null || discountPctRaw === undefined
          ? 0
          : Number(discountPctRaw);

      const quotationPayloadBase = {
        organization_id: organizationId,
        breakdown_id: breakdownId,
        site_id: payload.site_id,
        customer_name: customerName,
        customer_phone: (siteRow.phone as string | null) ?? null,
        customer_address: (siteRow.address as string | null) ?? null,
        subtotal: this.roundMoney(Number(bsRow.subtotal ?? 0)),
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        tax_percentage: Number.isFinite(tax_percentage) ? tax_percentage : 0,
        discount_percentage: Number.isFinite(discount_percentage)
          ? discount_percentage
          : 0,
        total: this.roundMoney(Number(bsRow.total ?? 0)),
        valid_until: this.quotationValidUntilIsoDate(),
        created_by: userId,
      };

      // Service role: `quotations` / `quotation_items` often have no INSERT policy for JWT
      // (same pattern as `stock_movements` in BreakdownService). Access is enforced above.
      let quotation_number = buildQuotationNumber();
      let quotationRow: Record<string, unknown> | null = null;
      let quotationError: { message?: string } | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        const { data, error } = await supabase
          .from('quotations')
          .insert([{ ...quotationPayloadBase, quotation_number }])
          .select()
          .single();

        if (!error && data) {
          quotationRow = data as Record<string, unknown>;
          quotationError = null;
          break;
        }

        quotationError = error;
        if (!isUniqueConstraintViolation(error) || attempt === 19) {
          break;
        }
        quotation_number = withDocumentNumberDisambiguator(buildQuotationNumber());
      }

      if (quotationError || !quotationRow) {
        return {
          success: false,
          message: quotationError?.message || 'Failed to create quotation',
        };
      }

      const quotationId = quotationRow.id as string;

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
          await supabase
            .from('quotations')
            .delete()
            .eq('id', quotationId)
            .eq('organization_id', organizationId);
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
        quotation_id: string;
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
          quotation_id: quotationId,
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
          quotation_id: quotationId,
          title: rec.title,
          description: null,
          quantity: Number(rec.quantity ?? 1),
          price: this.roundMoney(Number(rec.price ?? 0)),
          total: this.roundMoney(Number(rec.total ?? 0)),
        });
      }

      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from('quotation_items').insert(itemRows);
        if (itemsError) {
          await supabase
            .from('quotations')
            .delete()
            .eq('id', quotationId)
            .eq('organization_id', organizationId);
          return { success: false, message: itemsError.message };
        }
      }

      const { data: itemsOut } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', quotationId);

      const { data: orgRow } = await userSupabase
        .from('organizations')
        .select('company_name, logo, gst, pan, address, phone')
        .eq('id', organizationId)
        .single();

      let pdfObjectPath: string | undefined;
      let pdfError: string | undefined;
      let quotationPathPersistError: string | undefined;
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

        const q = quotationRow as Record<string, unknown>;
        const discountAmt = Number(
          q.discount_amount !== undefined && q.discount_amount !== null
            ? q.discount_amount
            : (q.discount ?? 0),
        );
        const taxAmt = Number(
          q.tax_amount !== undefined && q.tax_amount !== null ? q.tax_amount : (q.tax ?? 0),
        );
        const pdfDiscountPct = q.discount_percentage;
        const pdfTaxPct = q.tax_percentage;
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
            invoice_number: String(q.quotation_number ?? ''),
            type: 'quotation',
            customer_name: String(q.customer_name ?? ''),
            customer_phone: (q.customer_phone as string | null) ?? null,
            customer_address: (q.customer_address as string | null) ?? null,
            subtotal: this.roundMoney(Number(q.subtotal ?? 0)),
            discount: this.roundMoney(discountAmt),
            discount_percentage:
              pdfDiscountPct === null || pdfDiscountPct === undefined
                ? null
                : Number(pdfDiscountPct),
            tax: this.roundMoney(taxAmt),
            tax_percentage:
              pdfTaxPct === null || pdfTaxPct === undefined ? null : Number(pdfTaxPct),
            total: this.roundMoney(Number(q.total ?? 0)),
            created_at: (q.created_at as string | null) ?? null,
          },
          items: pdfItems,
        });

        const pdfFileName = `quotation-${quotationId}.pdf`;
        const uploadResult = await this.fileService.uploadPrivateBufferForOrgSite(
          token,
          organizationId,
          payload.site_id,
          pdfBuffer,
          pdfFileName,
        );
        if (uploadResult.success && uploadResult.data?.object_path) {
          pdfObjectPath = uploadResult.data.object_path;
          const { error: quotationFileErr } = await supabase
            .from('quotations')
            .update({ file_path: pdfObjectPath })
            .eq('id', quotationId)
            .eq('organization_id', organizationId);
          if (quotationFileErr) {
            quotationPathPersistError = quotationFileErr.message;
          } else {
            const { error: bsLinkErr } = await userSupabase
              .from('breakdown_services')
              .update({ quotation_id: quotationId })
              .eq('id', payload.breakdown_service_id);
            if (bsLinkErr) {
              quotationPathPersistError = bsLinkErr.message;
            }
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
          ...quotationRow,
          quotation_items: itemsOut ?? [],
          quotation_pdf_object_path: pdfObjectPath,
          ...(pdfError ? { quotation_pdf_error: pdfError } : {}),
          ...(quotationPathPersistError
            ? { quotation_path_persist_error: quotationPathPersistError }
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

  /** Updates `quotations.status` for a row in the caller's organization. */
  async updateQuotationStatus(
    userId: string,
    token: string,
    payload: UpdateQuotationStatusDto,
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

      const { organizationId } = orgContext;

      const { data: existing, error: fetchError } = await supabase
        .from('quotations')
        .select('id')
        .eq('id', payload.quotation_id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (fetchError) {
        return { success: false, message: fetchError.message };
      }
      if (!existing) {
        return { success: false, message: 'Quotation not found' };
      }

      const { data: updated, error: updateError } = await supabase
        .from('quotations')
        .update({ status: payload.status })
        .eq('id', payload.quotation_id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (updateError || !updated) {
        return {
          success: false,
          message: updateError?.message || 'Failed to update quotation status',
        };
      }

      return {
        success: true,
        message: 'Quotation status updated',
        data: updated,
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
