import { IsUUID } from 'class-validator';

export class GenerateInvoicePdfDto {
  @IsUUID()
  invoice_id!: string;
}
