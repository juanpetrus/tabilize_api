import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class AbacateCheckoutDto {
  @ApiProperty({ example: 'plan_pro', description: 'Identificador do plano' })
  @IsString()
  planId: string;

  @ApiProperty({
    enum: ['monthly', 'yearly'],
    example: 'monthly',
    description:
      'Periodicidade da assinatura (name/email/document são derivados do User/Team)',
  })
  @IsEnum(['monthly', 'yearly'])
  period: 'monthly' | 'yearly';
}
