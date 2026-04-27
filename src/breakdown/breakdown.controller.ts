import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BreakdownService } from './breakdown.service';
import { AddBreakdownServiceDto, CreateBreakdownDto, UpdateBreakdownDto } from './dto';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('breakdown')
export class BreakdownController {
  constructor(private readonly breakdownService: BreakdownService) {}

  @Post('create')
  async create(
    @Req() req: any,
    @Body() createBreakdownDto: CreateBreakdownDto,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.createBreakdown(
      req?.user?.id,
      req?.token,
      createBreakdownDto,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Post('addService')
  async addService(
    @Req() req: any,
    @Body() body: AddBreakdownServiceDto,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.addBreakdownService(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('getBreakdownsForSite/:siteId')
  async findBySite(
    @Param('siteId') siteId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.findAllForSite(
      req?.user?.id,
      req?.token,
      siteId,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get(':id/services')
  async findBreakdownServices(
    @Param('id') breakdownId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.findServicesForBreakdown(
      req?.user?.id,
      req?.token,
      breakdownId,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.findBreakdownById(
      req?.user?.id,
      req?.token,
      id,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Put('update/:id')
  async update(
    @Param('id') id: string,
    @Body() updateBreakdownDto: UpdateBreakdownDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.breakdownService.updateBreakdown(
      req?.user?.id,
      req?.token,
      id,
      updateBreakdownDto,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const result = await this.breakdownService.deleteBreakdown(
      req?.user?.id,
      req?.token,
      id,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('filter/status')
  async filterByStatus(
    @Req() req: any,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
  ) {
    const result = await this.breakdownService.findByStatus(
      req?.user?.id,
      req?.token,
      status,
      siteId,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('filter/priority')
  async filterByPriority(
    @Req() req: any,
    @Res() res: Response,
    @Query('priority') priority?: string,
    @Query('siteId') siteId?: string,
  ) {
    const result = await this.breakdownService.findByPriority(
      req?.user?.id,
      req?.token,
      priority,
      siteId,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
