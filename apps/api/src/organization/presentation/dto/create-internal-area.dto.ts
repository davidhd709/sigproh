import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInternalAreaDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string;
}
