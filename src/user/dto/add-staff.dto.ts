import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export const STAFF_ROLES = ['STAFF', 'TECHNICIAN', 'HELPER'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export class AddStaffDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  phone!: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @IsOptional()
  @IsString()
  address?: string;
}
