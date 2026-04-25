import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
