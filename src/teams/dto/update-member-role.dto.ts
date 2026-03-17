import { IsEnum } from 'class-validator';
import { TeamRole } from '../../../generated/prisma/enums.js';

export class UpdateMemberRoleDto {
  @IsEnum(TeamRole)
  role: TeamRole;
}
