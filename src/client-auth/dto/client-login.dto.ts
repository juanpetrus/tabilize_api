import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class ClientLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
