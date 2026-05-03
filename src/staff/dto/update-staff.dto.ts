import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { STAFF_ROLES, type StaffRole } from './add-staff.dto';

/** Matches `public.users`: name varchar(100) not null, phone varchar(20), email varchar(255) unique. */
export class UpdateStaffDto {
  @IsNotEmpty()
  @IsString()
  organization_member_id!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}
