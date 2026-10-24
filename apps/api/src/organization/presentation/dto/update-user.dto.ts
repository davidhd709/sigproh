import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'El rol no es válido' })
  role?: Role;
}
