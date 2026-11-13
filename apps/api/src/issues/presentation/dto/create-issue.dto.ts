import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IssuePriority, IssueScope } from '../../../generated/prisma/client';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

// Los mensajes se muestran tal cual a quien reporta, por eso van en español y sin códigos
export class CreateIssueDto {
  @IsEnum(IssueScope, { message: 'Elige si ocurrió en un conjunto o edificio o en un área de la empresa' })
  @IsNotEmpty({ message: 'Elige dónde ocurrió' })
  scope!: IssueScope;

  @IsString({ message: 'El título debe ser texto' })
  @IsNotEmpty({ message: 'Escribe un título corto' })
  @MaxLength(160, { message: 'El título no puede superar 160 caracteres' })
  title!: string;

  @IsString({ message: 'La descripción debe ser texto' })
  @IsNotEmpty({ message: 'Describe qué pasó' })
  description!: string;

  @IsEnum(IssuePriority, { message: 'Elige qué tan urgente es' })
  @IsNotEmpty({ message: 'Elige qué tan urgente es' })
  priority!: IssuePriority;

  @IsValidUuid({ message: 'Elige una categoría válida' })
  @IsNotEmpty({ message: 'Elige una categoría' })
  categoryId!: string;

  @IsValidUuid({ message: 'Elige un conjunto o edificio válido' })
  @IsOptional()
  propertyId?: string;

  @IsValidUuid({ message: 'Elige una zona válida' })
  @IsOptional()
  propertyZoneId?: string;

  @IsValidUuid({ message: 'Elige un área de la empresa válida' })
  @IsOptional()
  internalAreaId?: string;

  @IsString({ message: 'Lo que se hizo de inmediato debe ser texto' })
  @IsOptional()
  urgentMeasures?: string;

  /**
   * Identificador de la operación generado en el dispositivo. Si la respuesta se pierde y el
   * cliente reintenta con el mismo valor, se devuelve la novedad ya registrada.
   */
  @IsUUID('all', { message: 'El identificador de la operación no es válido' })
  @IsOptional()
  clientRequestId?: string;
}
