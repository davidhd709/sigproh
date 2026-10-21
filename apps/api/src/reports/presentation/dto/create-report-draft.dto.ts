import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportScope } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreateReportDraftDto {
  @IsEnum(ReportScope, {
    message: 'El ámbito del informe debe ser PROPIEDAD, INTERNA o CONSOLIDADO',
  })
  scope: ReportScope;

  @IsString()
  @IsNotEmpty({ message: 'El título del informe es obligatorio' })
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsValidUuid({ message: 'propertyId debe ser un UUID válido' })
  propertyId?: string;

  @IsOptional()
  @IsValidUuid({ message: 'internalAreaId debe ser un UUID válido' })
  internalAreaId?: string;

  @IsDateString({}, { message: 'periodStart debe ser una fecha ISO válida (YYYY-MM-DD)' })
  periodStart: string;

  @IsDateString({}, { message: 'periodEnd debe ser una fecha ISO válida (YYYY-MM-DD)' })
  periodEnd: string;

  @IsOptional()
  @IsDateString({}, { message: 'cutoffDate debe ser una fecha ISO válida (YYYY-MM-DD)' })
  cutoffDate?: string;

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
