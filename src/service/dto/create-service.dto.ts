import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** Must match Postgres `service_type` enum; defaults to `maintenance` in the database if omitted */
  @IsOptional()
  @IsString()
  service_type?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_amc?: boolean;
}
