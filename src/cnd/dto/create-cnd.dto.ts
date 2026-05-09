import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsString,
} from 'class-validator';
import { CndType } from '../../../generated/prisma/enums.js';

export class CreateCndDto {
  @IsEnum(CndType)
  type: CndType;

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
  @IsBoolean()
  autoSync?: boolean;
}
