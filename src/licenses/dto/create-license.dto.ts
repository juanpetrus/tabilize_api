import { IsEnum, IsOptional, IsDateString, IsString } from 'class-validator';
import { LicenseType, LicenseStatus } from '../../../generated/prisma/enums.js';

export class CreateLicenseDto {
  @IsEnum(LicenseType)
  type: LicenseType;

  /** Texto livre. Obrigatório quando `type` for `OUTRO`; senão usa o rótulo do tipo. */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  issuingBody?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  protocolNumber?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Opcional — sobrescreve o status calculado a partir de `expirationDate`. */
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;
}
