import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class DiscardIssueDto {
  @IsNotEmpty({ message: 'El motivo de descarte es obligatorio' })
  @IsString()
  @MinLength(5, {
    message: 'El motivo de descarte debe tener al menos 5 caracteres',
  })
  @MaxLength(1000, {
    message: 'El motivo de descarte no puede superar 1000 caracteres',
  })
  reason!: string;
}
