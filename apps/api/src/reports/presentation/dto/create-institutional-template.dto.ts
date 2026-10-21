import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateInstitutionalTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  headerTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  headerSubtitle?: string;

  @IsOptional()
  @IsHexColor({ message: 'primaryColor debe ser un color hexadecimal válido (#RRGGBB)' })
  primaryColor?: string;

  @IsOptional()
  @IsHexColor({ message: 'secondaryColor debe ser un color hexadecimal válido (#RRGGBB)' })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  footerText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mandatorySections?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOptionalSections?: string[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
