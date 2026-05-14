import { IsArray, IsEmail, IsOptional } from 'class-validator';

export class SendNfeEmailDto {
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];
}
