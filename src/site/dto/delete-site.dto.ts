import { Equals, IsBoolean, IsUUID } from 'class-validator';

export class DeleteSiteDto {
  @IsUUID()
  site_id!: string;

  @IsBoolean()
  @Equals(true, { message: 'is_deleted must be true to remove site' })
  is_deleted!: boolean;
}
