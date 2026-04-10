import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { StaffService } from './staff.service';
import { AddStaffDto } from './dto/add-staff.dto';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('create')
  addStaff(@Req() req: any, @Body() body: AddStaffDto) {
    return this.staffService.addStaffMember(req?.user?.id, body);
  }

  @Get('getAll')
  findAllForOwner(@Req() req: any) {
    return this.staffService.findAllForOwner(req?.user?.id);
  }
}
