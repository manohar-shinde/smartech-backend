import { IsUUID } from 'class-validator';

/** Body for generating a quotation from an existing breakdown service bill. */
export class GenerateServiceQuotationDto {
  @IsUUID()
  site_id!: string;

  @IsUUID()
  breakdown_service_id!: string;
}
