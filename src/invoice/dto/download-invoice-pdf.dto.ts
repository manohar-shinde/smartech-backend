import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Same idea as `POST /file/private-download`: body identifies the document; response includes `signed_url`. */
export class DownloadInvoicePdfDto {
  @IsUUID()
  invoice_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  expires_in?: number;
}
