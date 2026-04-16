import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrCodeService } from './err-code.service';
import { CreateErrCodeDto } from './dto/create-err-code.dto';
import { UpdateErrCodeDto } from './dto/update-err-code.dto';

@Controller('err-code')
export class ErrCodeController {
  constructor(private readonly errCodeService: ErrCodeService) {}

  @Post('create')
  async create(
    @Body() createErrCodeDto: CreateErrCodeDto,
    @Res() res: Response,
  ) {
    const result = await this.errCodeService.create(createErrCodeDto);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('find-by-err-code')
  async findByErrCode(
    @Query('searchQuery') searchQuery: string,
    @Res() res: Response,
  ) {
    const result = await this.errCodeService.findByErrCode(searchQuery);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateErrCodeDto: UpdateErrCodeDto,
    @Res() res: Response,
  ) {
    const result = await this.errCodeService.update(+id, updateErrCodeDto);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    const result = await this.errCodeService.remove(+id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
