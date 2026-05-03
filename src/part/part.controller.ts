import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PartService } from './part.service';
import { CreatePartDto } from './dto/create-part.dto';
import { DeletePartDto } from './dto/delete-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { UpdatePartStockDto } from './dto/update-part-stock.dto';
import { GetMonthlyPartSaleDto } from './dto/get-monthly-part-sale.dto';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('part')
export class PartController {
  constructor(private readonly partService: PartService) {}

  @Post('create')
  async createPart(
    @Req() req: any,
    @Body() body: CreatePartDto,
    @Res() res: Response,
  ) {
    const result = await this.partService.createPartForOwner(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Patch('update')
  async updatePart(
    @Req() req: any,
    @Body() body: UpdatePartDto,
    @Res() res: Response,
  ) {
    const result = await this.partService.updatePartForOwner(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Patch('delete')
  async softDeletePart(
    @Req() req: any,
    @Body() body: DeletePartDto,
    @Res() res: Response,
  ) {
    const result = await this.partService.softDeletePart(req?.user?.id, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Post('update-stock')
  async updateStock(
    @Req() req: any,
    @Body() body: UpdatePartStockDto,
    @Res() res: Response,
  ) {
    const result = await this.partService.updateStockForOwner(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('getAll')
  async findAllForOwner(@Req() req: any, @Res() res: Response) {
    const result = await this.partService.findAllForOwner(req?.user?.id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Post('monthly-sale')
  async getMonthlySale(@Req() req: any, @Body() body: GetMonthlyPartSaleDto, @Res() res: Response) {
    const result = await this.partService.getMonthlySaleForOwner(req?.user?.id, req?.token, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
