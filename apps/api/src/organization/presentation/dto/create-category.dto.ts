import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IssueScope } from '../../../generated/prisma/client';

export class CreateCategoryDto {
  @IsEnum(IssueScope, { message: 'El ámbito debe ser PROPIEDAD o INTERNA' })
  scope!: IssueScope;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Si exige evidencia de etapa FINAL para poder cerrar (RF-023). */
  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;
}
