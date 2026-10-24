import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** El ámbito no se cambia: las novedades ya registradas dependen de él. */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
