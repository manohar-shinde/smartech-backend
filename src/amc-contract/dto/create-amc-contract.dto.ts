import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAmcContractDto {
  @IsNotEmpty()
  @IsUUID()
  site_id!: string;

  @IsNotEmpty()
  @IsDateString()
  start_date!: string;

  @IsNotEmpty()
  @IsDateString()
  end_date!: string;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contract_amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
