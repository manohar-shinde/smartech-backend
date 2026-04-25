import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StaffService } from './staff.service';
import { AddStaffDto } from './dto/add-staff.dto';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('create')
  async addStaff(
    @Req() req: any,
    @Body() body: AddStaffDto,
    @Res() res: Response,
  ) {
    const result = await this.staffService.addStaffMember(
      req?.user?.id,
      req?.token,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('getAll')
  async findAllForOwner(@Req() req: any, @Res() res: Response) {
    const result = await this.staffService.findAllForOwner(req?.user?.id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
