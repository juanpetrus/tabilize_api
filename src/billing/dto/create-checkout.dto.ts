import { IsEmail, IsEnum, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  planId: string;

  @IsEnum(['monthly', 'yearly'])
  period: 'monthly' | 'yearly';

  @IsString()
  name: string;

  @IsEmail()
  email: string;
}
