import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class AssignAreaUserDto {
  @IsValidUuid()
  @IsNotEmpty()
  userId!: string;

  @IsBoolean()
  @IsOptional()
  isLead?: boolean;
}
