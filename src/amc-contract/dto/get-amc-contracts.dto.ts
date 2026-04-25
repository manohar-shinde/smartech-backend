import { Transform } from 'class-transformer';
import { Allow, IsNotEmpty, IsUUID } from 'class-validator';

export class GetAmcContractsDto {
  /** Whitelisted for camelCase clients; value is read in `site_id` transform. */
  @Allow()
  siteId?: string;

  @Transform(({ value, obj }) => value ?? obj?.site_id ?? obj?.siteId)
  @IsNotEmpty()
  @IsUUID()
  site_id!: string;
}
