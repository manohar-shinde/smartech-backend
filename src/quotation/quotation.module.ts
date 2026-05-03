import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module.js';
import { QuotationController } from './quotation.controller.js';
import { QuotationService } from './quotation.service.js';
@Module({
  imports: [FileModule],
  controllers: [QuotationController],
  providers: [QuotationService],
  exports: [QuotationService],
})
export class QuotationModule {}
