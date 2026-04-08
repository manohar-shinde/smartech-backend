import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ErrCodeService } from './err-code.service';
import { CreateErrCodeDto } from './dto/create-err-code.dto';
import { UpdateErrCodeDto } from './dto/update-err-code.dto';

@Controller('err-code')
export class ErrCodeController {
  constructor(private readonly errCodeService: ErrCodeService) {}

  @Post('create')
  create(@Body() createErrCodeDto: CreateErrCodeDto) {
    return this.errCodeService.create(createErrCodeDto);
  }

  @Get('find-by-err-code')
  findByErrCode(@Query('searchQuery') searchQuery: string) {
    return this.errCodeService.findByErrCode(searchQuery);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateErrCodeDto: UpdateErrCodeDto) {
    return this.errCodeService.update(+id, updateErrCodeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.errCodeService.remove(+id);
  }
}
