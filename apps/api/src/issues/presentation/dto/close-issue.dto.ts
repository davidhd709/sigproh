import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseIssueDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: 'Las observaciones de cierre no pueden superar 2000 caracteres',
  })
  closureObservations?: string;
}
