import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PartService } from './part.service';
import { CreatePartDto } from './dto/create-part.dto';

@Controller('part')
export class PartController {
  constructor(private readonly partService: PartService) {}

  @Post('create')
  async createPart(
    @Req() req: any,
    @Body() body: CreatePartDto,
    @Res() res: Response,
  ) {
    const result = await this.partService.createPartForOwner(
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
    const result = await this.partService.findAllForOwner(req?.user?.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
