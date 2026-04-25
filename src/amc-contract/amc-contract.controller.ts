import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { getErrorStatusCode } from 'src/common/http-status.util';
import { AmcContractService } from './amc-contract.service';
import { CreateAmcContractDto } from './dto/create-amc-contract.dto';
import { UpdateAmcContractDto } from './dto/update-amc-contract.dto';
import { RenewAmcContractDto } from './dto/renew-amc-contract.dto';
import { GetAmcContractsDto } from './dto/get-amc-contracts.dto';

@Controller()
export class AmcContractController {
  constructor(private readonly amcContractService: AmcContractService) {}

  @Post('amc-contract/create')
  async createForSite(@Req() req: any, @Body() body: CreateAmcContractDto, @Res() res: Response) {
    const result = await this.amcContractService.createForSite(
      req?.user?.id,
      body.site_id,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Post('amc-contract/get')
  async listForSite(
    @Req() req: any,
    @Body() body: GetAmcContractsDto,
    @Res() res: Response,
  ) {
    const result = await this.amcContractService.listForSite(
      req?.user?.id,
      body.site_id,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('amc-contracts/:id')
  async findOne(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const result = await this.amcContractService.findOne(req?.user?.id, id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Patch('amc-contracts/:id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateAmcContractDto,
    @Res() res: Response,
  ) {
    const result = await this.amcContractService.update(req?.user?.id, id, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Post('amc-contracts/:id/renew')
  async renew(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: RenewAmcContractDto,
    @Res() res: Response,
  ) {
    const result = await this.amcContractService.renew(req?.user?.id, id, body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('amc-contracts/expiring-soon/list')
  async listExpiringSoon(
    @Req() req: any,
    @Query('days') days: string = '30',
    @Res() res: Response,
  ) {
    const daysParam = days ? parseInt(days, 10) : 30;
    if (Number.isNaN(daysParam) || daysParam < 0) {
      const errorResult = {
        success: false,
        message: 'days must be a non-negative number',
      };
      return res.status(getErrorStatusCode(errorResult)).json(errorResult);
    }

    const result = await this.amcContractService.listExpiringSoon(
      req?.user?.id,
      daysParam,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
