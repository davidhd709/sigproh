import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** El código no se puede cambiar: identifica la propiedad en novedades e informes. */
export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
