import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestClosureDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las notas de solicitud de cierre no pueden superar 1000 caracteres',
  })
  notes?: string;
}
