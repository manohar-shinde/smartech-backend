import { Equals, IsBoolean, IsUUID } from 'class-validator';

export class DeletePartDto {
  @IsUUID()
  part_id!: string;

  @IsBoolean()
  @Equals(true, { message: 'is_deleted must be true to remove part' })
  is_deleted!: boolean;
}
