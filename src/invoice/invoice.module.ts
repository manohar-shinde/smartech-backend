import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module.js';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';

@Module({
  imports: [FileModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
