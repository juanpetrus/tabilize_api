import { IsEnum, IsOptional, IsDateString, IsString } from 'class-validator';
import { LicenseType, LicenseStatus } from '../../../generated/prisma/enums.js';

export class UpdateLicenseDto {
  @IsOptional()
  @IsEnum(LicenseType)
  type?: LicenseType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;

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

  // Uso interno (handler de upload)
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
