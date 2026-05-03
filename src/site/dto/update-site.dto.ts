import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateSiteDto {
  @IsUUID()
  site_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  site_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_person?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
