import { IsEmail } from 'class-validator';

export class PartnerForgotPasswordDto {
  @IsEmail()
  email: string;
}
