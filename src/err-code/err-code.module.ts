import { Module } from '@nestjs/common';
import { ErrCodeService } from './err-code.service';
import { ErrCodeController } from './err-code.controller';

@Module({
  controllers: [ErrCodeController],
  providers: [ErrCodeService],
})
export class ErrCodeModule {}
