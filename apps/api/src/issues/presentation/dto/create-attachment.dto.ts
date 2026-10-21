import { IsEnum, IsOptional } from 'class-validator';
import { EvidenceStage } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreateAttachmentDto {
  @IsOptional()
  @IsEnum(EvidenceStage, {
    message: 'La etapa de la evidencia debe ser INICIAL, EJECUCION, FINAL o SOPORTE',
  })
  stage?: EvidenceStage;

  @IsOptional()
  @IsValidUuid({ message: 'El identificador de la actividad debe ser un UUID válido' })
  activityId?: string;
}
