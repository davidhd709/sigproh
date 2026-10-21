import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class AssignPrincipalDto {
  @IsValidUuid()
  @IsNotEmpty()
  assignedUserId!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
