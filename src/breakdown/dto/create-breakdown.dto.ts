import {
  IsArray,
  IsIn,
  IsNotEmpty,
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

export class CreateBreakdownDto {
  @IsNotEmpty()
  @IsUUID()
  site_id!: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string | null;

  @IsNotEmpty()
  @IsString()
  title!: string;

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
}
