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
import { CreateBreakdownDto, UpdateBreakdownDto } from './dto';

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
      createBreakdownDto,
    );
    if (!result.success) {
      return res.status(400).json(result);
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
      siteId,
    );
    if (!result.success) {
      return res.status(400).json(result);
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
      id,
    );
    if (!result.success) {
      return res.status(400).json(result);
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
      id,
      updateBreakdownDto,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const result = await this.breakdownService.deleteBreakdown(
      req?.user?.id,
      id,
    );
    if (!result.success) {
      return res.status(400).json(result);
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
      status,
      siteId,
    );
    if (!result.success) {
      return res.status(400).json(result);
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
      priority,
      siteId,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
