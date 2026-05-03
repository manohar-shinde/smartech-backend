import { Injectable } from '@nestjs/common';
import {
  buildInvoiceNumber,
  isUniqueConstraintViolation,
  withDocumentNumberDisambiguator,
} from '../common/document-number.util.js';
import { FileService } from '../file/file.service.js';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client.js';
import {
  CreateInvoiceFromQuotationDto,
  CreatePaymentDto,
  GenerateInvoicePdfDto,
} from './dto/index.js';
import { buildInvoicePdfBuffer } from './invoice-pdf.js';

/**
 * Invoices are snapshots of an accepted quotation (`invoices` / `invoice_items`).
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly fileService: FileService) {}

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /** Owner’s org first, else a member org (same pattern as breakdown site lists). */
  private async getOrganizationContextForUser(
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

  private async validateSiteInOrganization(siteId: string, organizationId: string) {
    const { data: site, error } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      return { success: false as const, message: error.message };
    }
    if (!site) {
      return {
        success: false as const,
        message: 'Site not found in your organization',
      };
    }
    return { success: true as const };
  }

  /** True if the user owns the org or is a member of it. */
  private async userCanAccessOrganization(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data: owned } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (owned) {
      return true;
    }
    const { data: member } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(member);
  }

  private async isOrganizationOwner(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data: row } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .eq('owner_id', userId)
      .maybeSingle();
    return Boolean(row);
  }

  /**
   * `amount_paid` / `balance_due` are derived for list responses.
   * Only `partial` invoices load payment rows. `paid` uses invoice `total` as amount paid (no query).
   * `draft` uses zeros without querying payments.
   */
  private async enrichInvoicesWithPaymentRollups(
    userDb: ReturnType<typeof getUserSupabaseClient>,
    organizationId: string,
    invoices: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const partialIds = invoices
      .filter((inv) => String(inv.status ?? '').toLowerCase() === 'partial')
      .map((inv) => inv.id as string)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const paidSumByInvoiceId = new Map<string, number>();
    if (partialIds.length > 0) {
      const { data: payRows, error: payErr } = await userDb
        .from('payments')
        .select('invoice_id, amount')
        .in('invoice_id', partialIds)
        .eq('organization_id', organizationId);

      if (payErr) {
        throw new Error(payErr.message);
      }
      for (const row of payRows ?? []) {
        const rec = row as { invoice_id: string; amount?: unknown };
        const prev = paidSumByInvoiceId.get(rec.invoice_id) ?? 0;
        paidSumByInvoiceId.set(
          rec.invoice_id,
          this.roundMoney(prev + Number(rec.amount ?? 0)),
        );
      }
    }

    return invoices.map((inv) => {
      const status = String(inv.status ?? '').toLowerCase();
      const total = this.roundMoney(Number(inv.total ?? 0));

      if (status === 'paid') {
        return {
          ...inv,
          amount_paid: total,
          balance_due: 0,
        };
      }

      if (status === 'draft') {
        return {
          ...inv,
          amount_paid: 0,
          balance_due: 0,
        };
      }

      if (status === 'partial') {
        const id = inv.id as string;
        const amountPaid = paidSumByInvoiceId.get(id) ?? 0;
        const balanceDue = this.roundMoney(Math.max(0, total - amountPaid));
        return {
          ...inv,
          amount_paid: amountPaid,
          balance_due: balanceDue,
        };
      }

      return {
        ...inv,
        amount_paid: 0,
        balance_due: total,
      };
    });
  }

  /** All invoice headers for a site. Uses the user JWT so `invoices` RLS applies (org owners). */
  async listForSite(userId: string, token: string, siteId: string) {
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

      const orgContext = await this.getOrganizationContextForUser(userId);
      if (!orgContext.success || !orgContext.organizationId) {
        return {
          success: false,
          message: orgContext.message || 'Organization not found for this user',
        };
      }

      const owner = await this.isOrganizationOwner(userId, orgContext.organizationId);
      if (!owner) {
        return {
          success: false,
          message: 'Forbidden: only organization owners can view invoices',
        };
      }

      const siteOk = await this.validateSiteInOrganization(
        siteId,
        orgContext.organizationId,
      );
      if (!siteOk.success) {
        return siteOk;
      }

      const userDb = getUserSupabaseClient(token);
      const { data, error } = await userDb
        .from('invoices')
        .select('*')
        .eq('organization_id', orgContext.organizationId)
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, message: error.message };
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      let enriched: Record<string, unknown>[];
      try {
        enriched = await this.enrichInvoicesWithPaymentRollups(
          userDb,
          orgContext.organizationId,
          rows,
        );
      } catch (e) {
        return {
          success: false,
          message: e instanceof Error ? e.message : 'Failed to load payment totals',
        };
      }

      return {
        success: true,
        data: enriched,
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Copies header totals and line items from a quotation into `invoices` / `invoice_items`.
   * Requires quotation `status` = `accepted`. At most one invoice per quotation for this org.
   * `invoices` / `invoice_items` use the user JWT so owner RLS applies; quotations stay on service role.
   */
  async createFromAcceptedQuotation(
    userId: string,
    token: string,
    payload: CreateInvoiceFromQuotationDto,
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const { data: qRow, error: qErr } = await supabase
        .from('quotations')
        .select(
          'id, organization_id, site_id, customer_name, customer_phone, customer_address, subtotal, tax_amount, discount_amount, tax_percentage, discount_percentage, total, status, is_invoiced',
        )
        .eq('id', payload.quotation_id)
        .maybeSingle();

      if (qErr) {
        return {
          success: false,
          message: qErr.message || 'Failed to load quotation',
        };
      }
      if (!qRow) {
        return {
          success: false,
          message: 'Quotation not found or not accessible',
        };
      }

      const organizationId = (qRow as { organization_id: string }).organization_id;
      const allowed = await this.userCanAccessOrganization(userId, organizationId);
      if (!allowed) {
        return {
          success: false,
          message: 'Forbidden: you do not have access to this quotation',
        };
      }

      const owner = await this.isOrganizationOwner(userId, organizationId);
      if (!owner) {
        return {
          success: false,
          message: 'Forbidden: only organization owners can create invoices',
        };
      }

      const userDb = getUserSupabaseClient(token);

      const { data: existingInvoice, error: existingErr } = await userDb
        .from('invoices')
        .select('id')
        .eq('quotation_id', payload.quotation_id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existingErr) {
        return { success: false, message: existingErr.message };
      }
      if (existingInvoice) {
        return {
          success: false,
          message: 'Invoice already exists for this quotation',
        };
      }

      if (Boolean((qRow as { is_invoiced?: unknown }).is_invoiced)) {
        return {
          success: false,
          message: 'Quotation is already marked as invoiced',
        };
      }

      const status = String((qRow as { status?: unknown }).status ?? '');
      if (status !== 'accepted') {
        return {
          success: false,
          message: 'Quotation must be accepted before creating an invoice',
        };
      }

      const q = qRow as Record<string, unknown>;
      const taxAmount = this.roundMoney(
        Number(
          q.tax_amount !== undefined && q.tax_amount !== null ? q.tax_amount : (q.tax ?? 0),
        ),
      );
      const discountAmount = this.roundMoney(
        Number(
          q.discount_amount !== undefined && q.discount_amount !== null
            ? q.discount_amount
            : (q.discount ?? 0),
        ),
      );

      const taxPctRaw = q.tax_percentage;
      const discountPctRaw = q.discount_percentage;
      const tax_percentage =
        taxPctRaw === null || taxPctRaw === undefined ? 0 : Number(taxPctRaw);
      const discount_percentage =
        discountPctRaw === null || discountPctRaw === undefined
          ? 0
          : Number(discountPctRaw);

      const invoicePayloadBase = {
        organization_id: organizationId,
        site_id: q.site_id as string,
        customer_name: String(q.customer_name ?? ''),
        customer_phone: (q.customer_phone as string | null) ?? null,
        customer_address: (q.customer_address as string | null) ?? null,
        subtotal: this.roundMoney(Number(q.subtotal ?? 0)),
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        tax_percentage: Number.isFinite(tax_percentage) ? tax_percentage : 0,
        discount_percentage: Number.isFinite(discount_percentage)
          ? discount_percentage
          : 0,
        total: this.roundMoney(Number(q.total ?? 0)),
        quotation_id: payload.quotation_id,
        created_by: userId,
      };

      let invoice_number = buildInvoiceNumber();
      let invoiceRow: Record<string, unknown> | null = null;
      let invErr: { message?: string } | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        const { data, error } = await userDb
          .from('invoices')
          .insert([{ ...invoicePayloadBase, invoice_number }])
          .select()
          .single();

        if (!error && data) {
          invoiceRow = data as Record<string, unknown>;
          invErr = null;
          break;
        }

        invErr = error;
        if (!isUniqueConstraintViolation(error) || attempt === 19) {
          break;
        }
        invoice_number = withDocumentNumberDisambiguator(buildInvoiceNumber());
      }

      if (invErr || !invoiceRow) {
        return {
          success: false,
          message: invErr?.message || 'Failed to create invoice',
        };
      }

      const invoiceId = invoiceRow.id as string;

      const { data: qiRows, error: qiErr } = await supabase
        .from('quotation_items')
        .select('title, description, quantity, price, total')
        .eq('quotation_id', payload.quotation_id);

      if (qiErr) {
        await userDb.from('invoices').delete().eq('id', invoiceId).eq('organization_id', organizationId);
        return { success: false, message: qiErr.message };
      }

      const lines = qiRows ?? [];
      const itemRows = lines.map((row) => {
        const r = row as {
          title: string;
          description: string | null;
          quantity: unknown;
          price: unknown;
          total: unknown;
        };
        return {
          invoice_id: invoiceId,
          title: r.title,
          description: r.description ?? null,
          quantity: Number(r.quantity ?? 1),
          price: this.roundMoney(Number(r.price ?? 0)),
          total: this.roundMoney(Number(r.total ?? 0)),
        };
      });

      if (itemRows.length > 0) {
        const { error: iiErr } = await userDb.from('invoice_items').insert(itemRows);
        if (iiErr) {
          await userDb.from('invoices').delete().eq('id', invoiceId).eq('organization_id', organizationId);
          return { success: false, message: iiErr.message };
        }
      }

      const { error: qInvoicedErr } = await supabase
        .from('quotations')
        .update({ is_invoiced: true })
        .eq('id', payload.quotation_id)
        .eq('organization_id', organizationId);

      if (qInvoicedErr) {
        await userDb.from('invoice_items').delete().eq('invoice_id', invoiceId);
        await userDb.from('invoices').delete().eq('id', invoiceId).eq('organization_id', organizationId);
        return {
          success: false,
          message: qInvoicedErr.message || 'Failed to mark quotation as invoiced',
        };
      }

      const { data: itemsOut } = await userDb
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);

      return {
        success: true,
        message: 'Invoice created from quotation',
        data: {
          ...invoiceRow,
          invoice_items: itemsOut ?? [],
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Creates an invoice + single line item for a new AMC contract (no quotation).
   * Totals: subtotal/total = contract amount; tax and discount zero.
   */
  async createForAmcContract(
    userId: string,
    token: string,
    params: {
      organizationId: string;
      siteId: string;
      contractAmount: number;
    },
  ) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const { organizationId, siteId } = params;
      const owner = await this.isOrganizationOwner(userId, organizationId);
      if (!owner) {
        return {
          success: false,
          message: 'Forbidden: only organization owners can create invoices',
        };
      }

      const siteOk = await this.validateSiteInOrganization(siteId, organizationId);
      if (!siteOk.success) {
        return siteOk;
      }

      const { data: siteRow, error: siteErr } = await supabase
        .from('sites')
        .select('site_name, address, location, contact_person, phone')
        .eq('id', siteId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (siteErr) {
        return { success: false, message: siteErr.message };
      }
      if (!siteRow) {
        return { success: false, message: 'Site not found' };
      }

      const s = siteRow as Record<string, unknown>;
      const customer_name = String(s.contact_person || s.site_name || '');
      const customer_phone = (s.phone as string | null) ?? null;
      const addrParts = [s.address, s.location].filter(
        (x) => x !== null && x !== undefined && String(x).trim() !== '',
      );
      const customer_address =
        addrParts.length > 0 ? addrParts.map((x) => String(x)).join(', ') : null;

      const amount = this.roundMoney(Number(params.contractAmount));
      if (!Number.isFinite(amount) || amount < 0) {
        return { success: false, message: 'Invalid contract amount for invoice' };
      }

      const invoicePayloadBase = {
        organization_id: organizationId,
        site_id: siteId,
        customer_name,
        customer_phone,
        customer_address,
        subtotal: amount,
        tax_amount: 0,
        discount_amount: 0,
        tax_percentage: 0,
        discount_percentage: 0,
        total: amount,
        quotation_id: null as string | null,
        created_by: userId,
      };

      const userDb = getUserSupabaseClient(token);

      let invoice_number = buildInvoiceNumber();
      let invoiceRow: Record<string, unknown> | null = null;
      let invErr: { message?: string } | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        const { data, error } = await userDb
          .from('invoices')
          .insert([{ ...invoicePayloadBase, invoice_number }])
          .select()
          .single();

        if (!error && data) {
          invoiceRow = data as Record<string, unknown>;
          invErr = null;
          break;
        }

        invErr = error;
        if (!isUniqueConstraintViolation(error) || attempt === 19) {
          break;
        }
        invoice_number = withDocumentNumberDisambiguator(buildInvoiceNumber());
      }

      if (invErr || !invoiceRow) {
        return {
          success: false,
          message: invErr?.message || 'Failed to create invoice',
        };
      }

      const invoiceId = invoiceRow.id as string;
      const itemRow = {
        invoice_id: invoiceId,
        title: 'Annual Maintenance Cycle',
        description: null as string | null,
        quantity: 1,
        price: amount,
        total: amount,
      };

      const { error: iiErr } = await userDb.from('invoice_items').insert([itemRow]);
      if (iiErr) {
        await userDb.from('invoices').delete().eq('id', invoiceId).eq('organization_id', organizationId);
        return { success: false, message: iiErr.message };
      }

      const { data: itemsOut } = await userDb
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);

      return {
        success: true,
        message: 'Invoice created for AMC contract',
        data: {
          ...invoiceRow,
          invoice_items: itemsOut ?? [],
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Inserts a row in `payments` for an invoice. Amount must be positive and not exceed
   * outstanding balance (invoice total minus sum of existing payments).
   */
  async addPayment(userId: string, token: string, payload: CreatePaymentDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const userDb = getUserSupabaseClient(token);

      const { data: inv, error: invErr } = await userDb
        .from('invoices')
        .select('id, organization_id, total')
        .eq('id', payload.invoice_id)
        .maybeSingle();

      if (invErr) {
        return { success: false, message: invErr.message };
      }
      if (!inv) {
        return { success: false, message: 'Invoice not found or not accessible' };
      }

      const organizationId = (inv as { organization_id: string }).organization_id;
      const owner = await this.isOrganizationOwner(userId, organizationId);
      if (!owner) {
        return {
          success: false,
          message: 'Forbidden: only organization owners can record payments',
        };
      }

      const invoiceTotal = this.roundMoney(
        Number((inv as { total?: unknown }).total ?? 0),
      );
      if (invoiceTotal <= 0) {
        return {
          success: false,
          message: 'Invalid invoice total for payment',
        };
      }

      const { data: payRows, error: payErr } = await userDb
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id);

      if (payErr) {
        return { success: false, message: payErr.message };
      }

      const paidSoFar = (payRows ?? []).reduce(
        (sum, row) => sum + this.roundMoney(Number((row as { amount?: unknown }).amount ?? 0)),
        0,
      );
      const outstanding = this.roundMoney(invoiceTotal - paidSoFar);

      if (outstanding <= 0) {
        return {
          success: false,
          message: 'Invoice is already fully paid',
        };
      }

      const amount = this.roundMoney(Number(payload.amount));
      if (amount < 1 && outstanding >= 1) {
        return {
          success: false,
          message: 'Payment amount must be at least 1 when outstanding balance is 1 or more',
        };
      }
      if (amount > outstanding + 0.001) {
        return {
          success: false,
          message: `Payment amount cannot exceed outstanding balance (${outstanding})`,
        };
      }
      if (amount <= 0) {
        return { success: false, message: 'Payment amount must be greater than 0' };
      }

      const paymentDate =
        payload.payment_date && payload.payment_date.length > 0
          ? new Date(payload.payment_date).toISOString()
          : new Date().toISOString();

      const insertRow = {
        invoice_id: payload.invoice_id,
        organization_id: organizationId,
        amount,
        payment_date: paymentDate,
        payment_method: payload.payment_method ?? 'bank_transfer',
        reference_number: payload.reference_number?.trim() || null,
        notes: payload.notes?.trim() || null,
        bank_details: payload.bank_details?.trim() || null,
        created_by: userId,
      };

      const { data: paymentRow, error: insertErr } = await userDb
        .from('payments')
        .insert([insertRow])
        .select()
        .single();

      if (insertErr || !paymentRow) {
        return {
          success: false,
          message: insertErr?.message || 'Failed to record payment',
        };
      }

      const remainingAfter = this.roundMoney(outstanding - amount);
      const nextStatus = remainingAfter <= 0.001 ? 'paid' : 'partial';

      const paymentId = paymentRow.id as string;
      const { error: invUpdateErr } = await userDb
        .from('invoices')
        .update({ status: nextStatus })
        .eq('id', payload.invoice_id)
        .eq('organization_id', organizationId);

      if (invUpdateErr) {
        await userDb.from('payments').delete().eq('id', paymentId);
        return {
          success: false,
          message: invUpdateErr.message || 'Failed to update invoice status',
        };
      }

      return {
        success: true,
        message: 'Payment recorded successfully',
        data: {
          ...(paymentRow as Record<string, unknown>),
          invoice_status: nextStatus,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Builds invoice PDF (line items + payment history), uploads to `private-files`
   * under `{organization_id}/{site_id}/`, and sets `invoices.file_path`.
   */
  async generateInvoicePdf(userId: string, token: string, payload: GenerateInvoicePdfDto) {
    try {
      if (!token) {
        return { success: false, message: 'Access token is required' };
      }
      if (!userId) {
        return { success: false, message: 'User is not authenticated' };
      }

      const userDb = getUserSupabaseClient(token);

      const { data: inv, error: invErr } = await userDb
        .from('invoices')
        .select('*')
        .eq('id', payload.invoice_id)
        .maybeSingle();

      if (invErr) {
        return { success: false, message: invErr.message };
      }
      if (!inv) {
        return { success: false, message: 'Invoice not found or not accessible' };
      }

      const invRecord = inv as Record<string, unknown>;
      const organizationId = invRecord.organization_id as string;
      const siteId = invRecord.site_id as string | null | undefined;
      if (!siteId || typeof siteId !== 'string') {
        return {
          success: false,
          message: 'Invoice has no site_id; cannot store PDF in org/site path',
        };
      }

      const owner = await this.isOrganizationOwner(userId, organizationId);
      if (!owner) {
        return {
          success: false,
          message: 'Forbidden: only organization owners can generate invoice PDFs',
        };
      }

      const { data: itemsOut, error: itemsErr } = await userDb
        .from('invoice_items')
        .select('title, description, quantity, price, total')
        .eq('invoice_id', payload.invoice_id);

      if (itemsErr) {
        return { success: false, message: itemsErr.message };
      }

      const { data: payRows, error: payErr } = await userDb
        .from('payments')
        .select('payment_date, payment_method, reference_number, amount, notes')
        .eq('invoice_id', payload.invoice_id)
        .order('payment_date', { ascending: true });

      if (payErr) {
        return { success: false, message: payErr.message };
      }

      const { data: orgRow, error: orgErr } = await userDb
        .from('organizations')
        .select('company_name, logo, gst, pan, address, phone')
        .eq('id', organizationId)
        .maybeSingle();

      if (orgErr) {
        return { success: false, message: orgErr.message };
      }

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

      const discountAmt = Number(
        invRecord.discount_amount !== undefined && invRecord.discount_amount !== null
          ? invRecord.discount_amount
          : (invRecord.discount ?? 0),
      );
      const taxAmt = Number(
        invRecord.tax_amount !== undefined && invRecord.tax_amount !== null
          ? invRecord.tax_amount
          : (invRecord.tax ?? 0),
      );

      const paymentsForPdf = (payRows ?? []).map((row) => {
        const r = row as {
          payment_date: string | null;
          payment_method: string | null;
          reference_number: string | null;
          amount: unknown;
          notes: string | null;
        };
        return {
          payment_date: r.payment_date,
          payment_method: r.payment_method,
          reference_number: r.reference_number,
          amount: this.roundMoney(Number(r.amount ?? 0)),
          notes: r.notes,
        };
      });

      const amountPaidTotal = paymentsForPdf.reduce((s, p) => this.roundMoney(s + p.amount), 0);
      const invoiceTotal = this.roundMoney(Number(invRecord.total ?? 0));
      const balanceDue = this.roundMoney(Math.max(0, invoiceTotal - amountPaidTotal));

      const pdfDiscountPct = invRecord.discount_percentage;
      const pdfTaxPct = invRecord.tax_percentage;

      const pdfBuffer = await buildInvoicePdfBuffer({
        org: {
          company_name: (orgRow?.company_name as string) ?? null,
          logo: (orgRow?.logo as string) ?? null,
          gst: (orgRow?.gst as string) ?? null,
          pan: (orgRow?.pan as string) ?? null,
          address: (orgRow?.address as string) ?? null,
          phone: (orgRow?.phone as string) ?? null,
        },
        invoice: {
          invoice_number: String(invRecord.invoice_number ?? ''),
          type: 'invoice',
          customer_name: String(invRecord.customer_name ?? ''),
          customer_phone: (invRecord.customer_phone as string | null) ?? null,
          customer_address: (invRecord.customer_address as string | null) ?? null,
          subtotal: this.roundMoney(Number(invRecord.subtotal ?? 0)),
          discount: this.roundMoney(discountAmt),
          discount_percentage:
            pdfDiscountPct === null || pdfDiscountPct === undefined
              ? null
              : Number(pdfDiscountPct),
          tax: this.roundMoney(taxAmt),
          tax_percentage:
            pdfTaxPct === null || pdfTaxPct === undefined ? null : Number(pdfTaxPct),
          total: invoiceTotal,
          created_at: (invRecord.created_at as string | null) ?? null,
        },
        items: pdfItems,
        payments: paymentsForPdf,
        amountPaidTotal,
        balanceDue,
      });

      const pdfFileName = `invoice-${payload.invoice_id}.pdf`;
      const uploadResult = await this.fileService.uploadPrivateBufferForOrgSite(
        token,
        organizationId,
        siteId,
        pdfBuffer,
        pdfFileName,
      );

      if (!uploadResult.success || !uploadResult.data?.object_path) {
        return {
          success: false,
          message: uploadResult.message || 'PDF upload failed',
        };
      }

      const objectPath = uploadResult.data.object_path;
      const { error: updErr } = await userDb
        .from('invoices')
        .update({ file_path: objectPath })
        .eq('id', payload.invoice_id)
        .eq('organization_id', organizationId);

      if (updErr) {
        return {
          success: false,
          message: updErr.message || 'Failed to save invoice file path',
        };
      }

      return {
        success: true,
        message: 'Invoice PDF generated successfully',
        data: {
          invoice_id: payload.invoice_id,
          file_path: objectPath,
          amount_paid: amountPaidTotal,
          balance_due: balanceDue,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Resolves `invoices.file_path` for an invoice the user may access as org owner (PDF must exist).
   */
  private async resolveInvoicePdfPathForOwner(
    userId: string,
    token: string,
    invoiceId: string,
  ): Promise<{ ok: true; filePath: string } | { ok: false; message: string }> {
    if (!token) {
      return { ok: false, message: 'Access token is required' };
    }
    if (!userId) {
      return { ok: false, message: 'User is not authenticated' };
    }
    if (!invoiceId) {
      return { ok: false, message: 'Invoice ID is required' };
    }

    const userDb = getUserSupabaseClient(token);
    const { data: inv, error: invErr } = await userDb
      .from('invoices')
      .select('id, organization_id, file_path')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr) {
      return { ok: false, message: invErr.message };
    }
    if (!inv) {
      return { ok: false, message: 'Invoice not found or not accessible' };
    }

    const organizationId = (inv as { organization_id: string }).organization_id;
    const owner = await this.isOrganizationOwner(userId, organizationId);
    if (!owner) {
      return {
        ok: false,
        message: 'Forbidden: only organization owners can download invoice PDFs',
      };
    }

    const filePath = (inv as { file_path?: string | null }).file_path;
    if (!filePath || String(filePath).trim() === '') {
      return {
        ok: false,
        message: 'No PDF generated for this invoice yet. Generate the PDF first.',
      };
    }

    return { ok: true, filePath: String(filePath).trim() };
  }

  /**
   * JSON metadata + `open_url` (`GET /file/open?path=…`) for clients that want a stable app link.
   */
  async getInvoicePdfOpenUrl(userId: string, token: string, invoiceId: string) {
    try {
      const resolved = await this.resolveInvoicePdfPathForOwner(userId, token, invoiceId);
      if (!resolved.ok) {
        return { success: false, message: resolved.message };
      }

      const openResult = await this.fileService.getPrivateFileOpenAppUrl(userId, resolved.filePath);
      if (!openResult.success || !('data' in openResult) || !openResult.data) {
        return openResult;
      }

      return {
        success: true,
        data: {
          invoice_id: invoiceId,
          /** Same value as `invoices.file_path` (storage object key in `private-files`). */
          file_path: openResult.data.object_path,
          ...openResult.data,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Signed URL payload for `POST /invoice/download` (same pattern as `POST /file/private-download`).
   */
  async prepareInvoicePdfDownload(
    userId: string,
    token: string,
    invoiceId: string,
    expiresInRaw?: number,
  ) {
    try {
      const resolved = await this.resolveInvoicePdfPathForOwner(userId, token, invoiceId);
      if (!resolved.ok) {
        return { success: false, message: resolved.message };
      }

      const signed = await this.fileService.getPrivateFileDownloadUrl(
        userId,
        resolved.filePath,
        expiresInRaw ?? 60 * 10,
      );
      if (!signed.success || !('data' in signed) || !signed.data) {
        return signed;
      }

      return {
        success: true as const,
        data: {
          invoice_id: invoiceId,
          file_path: signed.data.object_path,
          ...signed.data,
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
