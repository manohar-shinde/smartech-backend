import { IsIn, IsUUID } from 'class-validator';

/** Matches `public.quotation_status` in the database. */
export const QUOTATION_STATUS_VALUES = [
  'draft',
  'sent',
  'revised',
  'accepted',
  'rejected',
  'expired',
] as const;

export type QuotationStatusValue = (typeof QUOTATION_STATUS_VALUES)[number];

export class UpdateQuotationStatusDto {
  @IsUUID()
  quotation_id!: string;

  @IsIn([...QUOTATION_STATUS_VALUES])
  status!: QuotationStatusValue;
}
