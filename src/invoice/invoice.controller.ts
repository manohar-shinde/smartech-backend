import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getErrorStatusCode } from '../common/http-status.util';
import { GenerateServiceQuotationDto } from './dto';
import { InvoiceService } from './invoice.service';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /** Quotation from a single breakdown service bill (parts + charges as line items). */
  @Post('quotations/service')
  async createServiceQuotation(
    @Req() req: any,
    @Body() body: GenerateServiceQuotationDto,
    @Res() res: Response,
  ) {
    const result = await this.invoiceService.generateServiceQuotation(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }
}
