import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { TeamRole } from '../../../generated/prisma/enums.js';

export class InviteMemberDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsEnum(TeamRole)
  role: TeamRole;
}
