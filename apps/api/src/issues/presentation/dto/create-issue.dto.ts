import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { IssuePriority, IssueScope } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreateIssueDto {
  @IsEnum(IssueScope)
  @IsNotEmpty()
  scope!: IssueScope;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(IssuePriority)
  @IsNotEmpty()
  priority!: IssuePriority;

  @IsValidUuid()
  @IsNotEmpty()
  categoryId!: string;

  @IsValidUuid()
  @IsOptional()
  propertyId?: string;

  @IsValidUuid()
  @IsOptional()
  propertyZoneId?: string;

  @IsValidUuid()
  @IsOptional()
  internalAreaId?: string;

  @IsString()
  @IsOptional()
  urgentMeasures?: string;
}
