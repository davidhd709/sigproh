import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  password!: string;
}
