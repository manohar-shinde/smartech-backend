import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpsertOrganizationDto {
  @IsOptional()
  logo?: string;

  @IsString()
  @MaxLength(150)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_person?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gst?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string;

  @IsOptional()
  site?: string;
}
