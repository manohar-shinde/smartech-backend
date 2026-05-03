import { IsUUID } from 'class-validator';

/** Body for creating an invoice by copying an accepted quotation. */
export class CreateInvoiceFromQuotationDto {
  @IsUUID()
  quotation_id!: string;
}
