import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReturnIssueDto {
  @IsNotEmpty({ message: 'El motivo de devolución es obligatorio' })
  @IsString()
  @MinLength(5, {
    message: 'El motivo de devolución debe tener al menos 5 caracteres',
  })
  @MaxLength(1000, {
    message: 'El motivo de devolución no puede superar 1000 caracteres',
  })
  reason!: string;
}
