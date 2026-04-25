import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationService } from './organization.service';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('create')
  async createOrganization(
    @Req() req: any,
    @Body() body: UpsertOrganizationDto,
    @Res() res: Response,
  ) {
    const result = await this.organizationService.createOrganizationForUser(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Post()
  async upsertOrganization(
    @Req() req: any,
    @Body() body: UpsertOrganizationDto,
    @Res() res: Response,
  ) {
    const result = await this.organizationService.upsertOrganizationForUser(
      req?.user?.id,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('get')
  async findOrganizationForUser(@Req() req: any, @Res() res: Response) {
    const result = await this.organizationService.findOrganizationForUser(
      req?.user?.id,
      req?.token,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
