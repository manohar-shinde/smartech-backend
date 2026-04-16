import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post('create')
  async createSite(
    @Req() req: any,
    @Body() body: CreateSiteDto,
    @Res() res: Response,
  ) {
    const result = await this.sitesService.createSiteForUser(
      req?.user?.id,
      body,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('getAll')
  async findAllForUser(@Req() req: any, @Res() res: Response) {
    const result = await this.sitesService.findAllForUser(req?.user?.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('amc-expiring-soon')
  async getAmcExpiringWithin30Days(
    @Req() req: any,
    @Res() res: Response,
    @Query('days') days?: string,
  ) {
    const daysParam = days ? parseInt(days, 10) : 30;
    const result = await this.sitesService.getAmcExpiringWithinDays(
      req?.user?.id,
      daysParam,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
