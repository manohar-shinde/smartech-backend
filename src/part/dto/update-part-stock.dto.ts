import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePartStockDto {
  @IsUUID()
  part_id!: string;

  /** Amount to add to current on-hand stock (inserts one `IN` movement). */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
