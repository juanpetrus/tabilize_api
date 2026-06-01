import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ example: 'plan_pro', description: 'Identificador do plano' })
  @IsString()
  planId: string;

  @ApiProperty({ enum: ['monthly', 'yearly'], example: 'monthly' })
  @IsEnum(['monthly', 'yearly'])
  period: 'monthly' | 'yearly';

  @ApiProperty({ example: 'João da Silva', description: 'Nome para a fatura' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'joao@empresa.com.br', format: 'email' })
  @IsEmail()
  email: string;
}
