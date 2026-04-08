import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { UpsertOrganizationDto } from './dto/upsert-organization.dto';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('create')
  createProfile(@Req() req: any, @Body() body: UpsertOrganizationDto) {
    return this.organizationService.createProfileForUser(req?.user?.id, body);
  }

  @Post()
  upsert(@Req() req: any, @Body() body: UpsertOrganizationDto) {
    return this.organizationService.upsertForUser(req?.user?.id, body);
  }

  @Get('get')
  findMyDetails(@Req() req: any) {
    return this.organizationService.findForUser(req?.user?.id);
  }
}
