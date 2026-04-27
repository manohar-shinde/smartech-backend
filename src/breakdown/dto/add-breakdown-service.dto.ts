import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddBreakdownServicePartDto {
  @IsUUID()
  part_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount!: number;

  /** If omitted, computed as price × quantity */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;
}

export class AddBreakdownServiceChargeDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  /** If omitted, computed as price × quantity */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;
}

export class AddBreakdownServiceDto {
  @IsUUID()
  breakdown_id!: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsUUID()
  service_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_cost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  service_charge!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount_amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddBreakdownServicePartDto)
  service_parts!: AddBreakdownServicePartDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddBreakdownServiceChargeDto)
  service_charges!: AddBreakdownServiceChargeDto[];
}
