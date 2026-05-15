import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetMemberPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password?: string;
}
