import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsValidUuid()
  @IsOptional()
  assignedUserId?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
