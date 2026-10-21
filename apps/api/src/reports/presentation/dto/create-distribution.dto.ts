import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDistributionDto {
  @IsString()
  @IsNotEmpty({ message: 'El destinatario de la distribución es obligatorio' })
  @MaxLength(200)
  recipient!: string;

  @IsString()
  @IsNotEmpty({ message: 'El canal de entrega es obligatorio (ej. CORREO_ELECTRONICO, FISICO, PORTAL)' })
  @MaxLength(80)
  channel!: string;

  @IsDateString({}, { message: 'deliveryDate debe ser una fecha ISO válida (YYYY-MM-DD)' })
  deliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
