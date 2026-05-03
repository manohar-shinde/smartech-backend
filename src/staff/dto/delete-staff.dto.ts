import { Equals, IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class DeleteStaffDto {
  @IsNotEmpty()
  @IsString()
  organization_member_id!: string;

  @IsBoolean()
  @Equals(true, { message: 'is_deleted must be true to remove staff' })
  is_deleted!: boolean;
}
