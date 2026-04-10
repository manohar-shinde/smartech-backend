import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PartsService } from './parts.service';
import { CreatePartDto } from './dto/create-part.dto';

@Controller('parts')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Post('create')
  createPart(@Req() req: any, @Body() body: CreatePartDto) {
    return this.partsService.createPartForOwner(req?.user?.id, body);
  }

  @Get('getAll')
  findAllForOwner(@Req() req: any) {
    return this.partsService.findAllForOwner(req?.user?.id);
  }
}
