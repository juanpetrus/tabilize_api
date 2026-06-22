import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token recebido no email de redefinição',
  })
  @IsString()
  token: string;

  @ApiProperty({ example: 'novaSenha123', minLength: 6, description: 'Nova senha (mín. 6 caracteres)' })
  @IsString()
  @MinLength(6)
  password: string;
}
