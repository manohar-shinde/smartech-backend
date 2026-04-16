import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationService } from './organization.service';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('create')
  async createProfile(
    @Req() req: any,
    @Body() body: UpsertOrganizationDto,
    @Res() res: Response,
  ) {
    const result = await this.organizationService.createProfileForUser(
      req?.user?.id,
      body,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Post()
  async upsert(
    @Req() req: any,
    @Body() body: UpsertOrganizationDto,
    @Res() res: Response,
  ) {
    const result = await this.organizationService.upsertForUser(
      req?.user?.id,
      body,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('get')
  async findMyDetails(@Req() req: any, @Res() res: Response) {
    const result = await this.organizationService.findForUser(req?.user?.id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  }
}
