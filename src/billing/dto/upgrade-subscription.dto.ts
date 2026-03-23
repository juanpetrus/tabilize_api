import { IsEnum, IsString } from 'class-validator';

export class UpgradeSubscriptionDto {
  @IsString()
  planId: string;

  @IsEnum(['monthly', 'yearly'])
  period: 'monthly' | 'yearly';
}
