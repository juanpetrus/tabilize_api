import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { BillingCycle } from 'generated/prisma/enums';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome do escritório não pode ser vazio' })
  teamName: string;

  @IsString()
  @IsIn(['plan_starter', 'plan_pro'], { message: 'Plano inválido' })
  planId: string;

  @IsString()
  @IsEnum(BillingCycle, { message: 'O periodo deve ter um dos seguintes valores: MONTH, YEAR'})
  billingCycle: string;
}
