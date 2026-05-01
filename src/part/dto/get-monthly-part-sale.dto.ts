import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class GetMonthlyPartSaleDto {
  @IsUUID()
  part_id!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month!: string;
}
