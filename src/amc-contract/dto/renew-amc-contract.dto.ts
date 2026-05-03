import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RenewAmcContractDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contract_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
