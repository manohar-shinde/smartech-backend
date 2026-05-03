import { Body, Controller, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getErrorStatusCode } from '../common/http-status.util.js';
import { GenerateServiceQuotationDto, UpdateQuotationStatusDto } from './dto/index.js';
import { QuotationService } from './quotation.service.js';

@Controller('quotation')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  /** Quotation from a single breakdown service bill (parts + charges as line items). */
  @Post('service')
  async createServiceQuotation(
    @Req() req: any,
    @Body() body: GenerateServiceQuotationDto,
    @Res() res: Response,
  ) {
    const result = await this.quotationService.generateServiceQuotation(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Patch('status')
  async updateStatus(
    @Req() req: any,
    @Body() body: UpdateQuotationStatusDto,
    @Res() res: Response,
  ) {
    const result = await this.quotationService.updateQuotationStatus(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
