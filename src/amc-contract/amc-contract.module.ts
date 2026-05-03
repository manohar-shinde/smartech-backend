import { Module } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
import { AmcContractController } from './amc-contract.controller';
import { AmcContractService } from './amc-contract.service';

@Module({
  imports: [InvoiceModule],
  controllers: [AmcContractController],
  providers: [AmcContractService],
  exports: [AmcContractService],
})
export class AmcContractModule {}
