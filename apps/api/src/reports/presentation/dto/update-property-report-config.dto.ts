import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdatePropertyReportConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionalSectionsOrder?: string[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
