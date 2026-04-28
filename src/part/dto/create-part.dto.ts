import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePartDto {
  @IsNotEmpty()
  @IsString()
  part_name!: string;

  @IsNotEmpty()
  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sell_price?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  serial_number?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;
}
