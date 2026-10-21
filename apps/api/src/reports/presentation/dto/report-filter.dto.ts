import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportScope, ReportStatus } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class ReportFilterDto {
  @IsOptional()
  @IsEnum(ReportScope, {
    message: 'El ámbito debe ser PROPIEDAD, INTERNA o CONSOLIDADO',
  })
  scope?: ReportScope;

  @IsOptional()
  @IsEnum(ReportStatus, {
    message: 'El estado debe ser BORRADOR, EN_REVISION, DEVUELTO o APROBADO',
  })
  status?: ReportStatus;

  @IsOptional()
  @IsValidUuid({ message: 'propertyId debe ser un UUID válido' })
  propertyId?: string;

  @IsOptional()
  @IsValidUuid({ message: 'internalAreaId debe ser un UUID válido' })
  internalAreaId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
