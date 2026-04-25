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
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrCodeService } from './err-code.service';
import { CreateErrCodeDto } from './dto/create-err-code.dto';
import { UpdateErrCodeDto } from './dto/update-err-code.dto';
import { getErrorStatusCode } from 'src/common/http-status.util';

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
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get('find-by-err-code')
  async findByErrCode(
    @Query('searchQuery') searchQuery: string,
    @Res() res: Response,
  ) {
    if (!searchQuery?.trim()) {
      const errorResult = {
        success: false,
        message: 'searchQuery is required',
      };
      return res.status(getErrorStatusCode(errorResult)).json(errorResult);
    }
    const result = await this.errCodeService.findByErrCode(searchQuery);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateErrCodeDto: UpdateErrCodeDto,
    @Res() res: Response,
  ) {
    const result = await this.errCodeService.update(id, updateErrCodeDto);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.errCodeService.remove(id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
