import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  nit?: string;

  /** Coordinador principal: recibe automáticamente las novedades que reporten Gerencia, Auxiliar o Director. */
  @IsValidUuid()
  @IsNotEmpty({ message: 'Debe elegir el coordinador principal de la propiedad' })
  coordinatorId!: string;

  /** Director operativo responsable: recibe los avisos de la propiedad. */
  @IsValidUuid()
  @IsNotEmpty({ message: 'Debe elegir el director operativo responsable de la propiedad' })
  directorId!: string;
}
