import { IsOptional, IsDateString, IsString } from 'class-validator';

/**
 * Renovação de uma licença: cria um novo registro vinculado ao anterior.
 * `type` e `name` são herdados da licença renovada; `issuingBody` herda se não enviado.
 */
export class RenewLicenseDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  protocolNumber?: string;

  @IsOptional()
  @IsString()
  issuingBody?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
