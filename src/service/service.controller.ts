import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CreateServiceDto } from './dto/create-service.dto';
import { ServiceService } from './service.service';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('service')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Post('create')
  async create(@Req() req: any, @Body() body: CreateServiceDto, @Res() res: Response) {
    const result = await this.serviceService.createService(req?.user?.id, req?.token, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('getAll')
  async findAll(
    @Req() req: any,
    @Res() res: Response,
    @Query('service_type') serviceType?: string,
    @Query('is_amc') isAmc?: string,
  ) {
    const result = await this.serviceService.findAllForOrganization(
      req?.user?.id,
      req?.token,
      serviceType,
      isAmc,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const result = await this.serviceService.findById(req?.user?.id, req?.token, id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
