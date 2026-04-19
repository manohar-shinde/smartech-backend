import { Module } from '@nestjs/common';
import { BreakdownService } from './breakdown.service';
import { BreakdownController } from './breakdown.controller';

@Module({
  controllers: [BreakdownController],
  providers: [BreakdownService],
  exports: [BreakdownService],
})
export class BreakdownModule {}
