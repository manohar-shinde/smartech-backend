import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PartsService } from './parts.service';
import { CreatePartDto } from './dto/create-part.dto';

@Controller('parts')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Post('create')
  async createPart(
    @Req() req: any,
    @Body() body: CreatePartDto,
    @Res() res: Response,
  ) {
    const result = await this.partsService.createPartForOwner(
      req?.user?.id,
      body,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('getAll')
  async findAllForOwner(@Req() req: any, @Res() res: Response) {
    const result = await this.partsService.findAllForOwner(req?.user?.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
