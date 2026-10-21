import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ReviewReportDto {
  @IsIn(['APROBADO', 'DEVUELTO'], {
    message: 'La decisión debe ser APROBADO o DEVUELTO',
  })
  decision!: 'APROBADO' | 'DEVUELTO';

  @ValidateIf((o) => o.decision === 'DEVUELTO')
  @IsNotEmpty({
    message: 'Las observaciones son obligatorias cuando el informe es devuelto (RN-130, RN-145)',
  })
  @IsString()
  @MaxLength(1000)
  notes!: string;
}
