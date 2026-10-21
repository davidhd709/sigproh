import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { IssuePriority, IssueScope, IssueStatus } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class DashboardFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(IssueScope)
  scope?: IssueScope;

  @IsOptional()
  @IsValidUuid()
  propertyId?: string;

  @IsOptional()
  @IsValidUuid()
  internalAreaId?: string;

  @IsOptional()
  @IsValidUuid()
  assignedUserId?: string;

  @IsOptional()
  @IsValidUuid()
  categoryId?: string;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;
}
