import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'joao@empresa.com.br',
    format: 'email',
    description: 'Email da conta para envio do link de redefinição',
  })
  @IsEmail()
  email: string;
}
