import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { IsValidUuid } from '../../../shared/presentation/validators/is-valid-uuid.decorator';

export class AssignActivityDto {
  @IsValidUuid()
  @IsNotEmpty()
  assignedUserId!: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  version!: number;
}
