import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({ example: 'plan_pro', description: 'Novo plano' })
  @IsString()
  planId: string;

  @ApiProperty({ enum: ['monthly', 'yearly'], example: 'monthly' })
  @IsEnum(['monthly', 'yearly'])
  period: 'monthly' | 'yearly';
}
