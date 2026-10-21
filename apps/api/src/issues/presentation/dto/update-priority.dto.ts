import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { IssuePriority } from '../../../generated/prisma/client';

export class UpdatePriorityDto {
  @IsEnum(IssuePriority)
  @IsNotEmpty()
  priority!: IssuePriority;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
