import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsValidUuid()
  @IsOptional()
  activityId?: string;

  @IsArray()
  @IsValidUuid({ each: true })
  @IsOptional()
  mentions?: string[];
}
