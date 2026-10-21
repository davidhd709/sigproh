import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateReportDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  introduction?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  finalComments?: string;

  @IsOptional()
  @IsArray()
  selectedAttachmentIds?: string[];

  @IsOptional()
  @IsBoolean()
  showIntroduction?: boolean;

  @IsOptional()
  @IsBoolean()
  showKpis?: boolean;

  @IsOptional()
  @IsBoolean()
  showIssuesList?: boolean;

  @IsOptional()
  @IsBoolean()
  showActivities?: boolean;

  @IsOptional()
  @IsBoolean()
  showEvidences?: boolean;

  @IsOptional()
  @IsBoolean()
  showPendingIssues?: boolean;

  @IsOptional()
  @IsBoolean()
  showObservations?: boolean;

  @IsOptional()
  @IsBoolean()
  showRecommendations?: boolean;

  @IsOptional()
  @IsBoolean()
  showFinalComments?: boolean;
}
