import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator';
import {
  IssuePriority,
  IssueScope,
  IssueStatus,
} from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class ListIssuesQueryDto {
  @IsEnum(IssueScope)
  @IsOptional()
  scope?: IssueScope;

  @IsValidUuid()
  @IsOptional()
  propertyId?: string;

  @IsValidUuid()
  @IsOptional()
  internalAreaId?: string;

  @IsEnum(IssuePriority)
  @IsOptional()
  priority?: IssuePriority;

  @IsEnum(IssueStatus)
  @IsOptional()
  status?: IssueStatus;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isCritical?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  mine?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  pendingReview?: boolean;
}
