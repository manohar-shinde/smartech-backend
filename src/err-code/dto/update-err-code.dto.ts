import { PartialType } from '@nestjs/mapped-types';
import { CreateErrCodeDto } from './create-err-code.dto';

export class UpdateErrCodeDto extends PartialType(CreateErrCodeDto) {}
