import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getErrorStatusCode } from '../common/http-status.util.js';
import {
  CreateInvoiceFromQuotationDto,
  CreatePaymentDto,
  DownloadInvoicePdfDto,
  GenerateInvoicePdfDto,
} from './dto/index.js';
import { InvoiceService } from './invoice.service.js';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /** Invoice headers for one site (newest first), scoped like AMC `amc-contract/get`. */
  @Get('getInvoicesForSite/:siteId')
  async listForSite(
    @Param('siteId') siteId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.listForSite(req?.user?.id, req?.token, siteId);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  /**
   * Resolve `invoices.file_path` from `invoice_id` and return a signed download payload — same
   * pattern as quotation + `POST /file/private-download` (JSON with `signed_url`, optional `expires_in`).
   */
  @Post('download')
  async invoiceDownload(
    @Req() req: any,
    @Body() body: DownloadInvoicePdfDto,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.prepareInvoicePdfDownload(
      req?.user?.id,
      req?.token,
      body.invoice_id,
      body.expires_in,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    if (!('data' in result) || !result.data) {
      return res.status(500).json({ success: false, message: 'Download data not available' });
    }
    return res.status(200).json({
      success: true,
      message: 'Download link created',
      data: result.data,
    });
  }

  /** Build PDF, upload to private storage, set `invoices.file_path`. */
  @Post('generate-invoice-pdf')
  async generatePdf(
    @Req() req: any,
    @Body() body: GenerateInvoicePdfDto,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.generateInvoicePdf(req?.user?.id, req?.token, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  /** Snapshot of an accepted quotation into `invoices` / `invoice_items`. */
  @Post('create-from-quotation')
  async createFromQuotation(
    @Req() req: any,
    @Body() body: CreateInvoiceFromQuotationDto,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.createFromAcceptedQuotation(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  /** Record a payment against an invoice (amount ≤ outstanding balance). */
  @Post('add-payment')
  async addPayment(
    @Req() req: any,
    @Body() body: CreatePaymentDto,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.addPayment(req?.user?.id, req?.token, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }
}
