import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(80)
  lastName!: string;

  @IsEnum(Role, { message: 'El rol no es válido' })
  role!: Role;

  /** Contraseña inicial que el administrador entrega al usuario. */
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  password!: string;
}
