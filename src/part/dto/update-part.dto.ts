import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdatePartDto {
  @IsUUID()
  part_id!: string;

  @IsNotEmpty()
  @IsString()
  part_name!: string;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost_price!: number;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sell_price!: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  serial_number?: string | null;
}
