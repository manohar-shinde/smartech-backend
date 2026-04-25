import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @MaxLength(150)
  site_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_person?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

}
