import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PartService } from './part.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartStockDto } from './dto/update-part-stock.dto';
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
}
