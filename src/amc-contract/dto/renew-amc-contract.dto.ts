import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class RenewAmcContractDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
