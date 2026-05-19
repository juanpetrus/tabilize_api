import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class PartnerUpdateMeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
