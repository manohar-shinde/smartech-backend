import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post('create')
  createSite(@Req() req: any, @Body() body: CreateSiteDto) {
    return this.sitesService.createSiteForUser(req?.user?.id, body);
  }

  @Get('getAll')
  findAllForUser(@Req() req: any) {
    return this.sitesService.findAllForUser(req?.user?.id);
  }
}
