import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
] as const;

export class UpdateBreakdownDto {
  @IsOptional()
  @IsUUID()
  assigned_to?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn([...PRIORITIES])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsISO8601()
  resolved_at?: string | null;
}
