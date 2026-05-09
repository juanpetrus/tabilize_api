import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsString,
} from 'class-validator';
import { CndStatus } from '../../../generated/prisma/enums.js';

export class UpdateCndDto {
  @IsOptional()
  @IsEnum(CndStatus)
  status?: CndStatus;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  protocolNumber?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;

  @IsOptional()
  @IsString()
  lastError?: string;
}
