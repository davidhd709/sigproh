import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReopenIssueDto {
  @IsNotEmpty({ message: 'El motivo de reapertura es obligatorio' })
  @IsString()
  @MinLength(5, {
    message: 'El motivo de reapertura debe tener al menos 5 caracteres',
  })
  @MaxLength(1000, {
    message: 'El motivo de reapertura no puede superar 1000 caracteres',
  })
  reason!: string;
}
