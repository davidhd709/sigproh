import { IsNotEmpty, IsString } from 'class-validator';

export class AddUrgentMeasureDto {
  @IsString()
  @IsNotEmpty()
  measure!: string;
}
