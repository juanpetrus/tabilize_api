import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ClientRegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
