import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Aligns with `public.payment_method`; extend if your enum has more values. */
export const PAYMENT_METHOD_VALUES = [
  'bank_transfer',
  'cash',
  'card',
  'cheque',
  'upi',
  'other',
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHOD_VALUES)[number];

export class CreatePaymentDto {
  @IsUUID()
  invoice_id!: string;

  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'amount must be at least 0.01' })
  amount!: number;

  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @IsOptional()
  @IsIn([...PAYMENT_METHOD_VALUES])
  payment_method?: PaymentMethodValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reference_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bank_details?: string | null;
}
