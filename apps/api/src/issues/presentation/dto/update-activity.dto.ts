import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';
import { ActivityStatus } from '../../../generated/prisma/client';

export class UpdateActivityDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ActivityStatus)
  @IsOptional()
  status?: ActivityStatus;

  @IsString()
  @IsOptional()
  statusReason?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  version!: number;
}
