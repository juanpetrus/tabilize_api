import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class ShareItemDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsBoolean()
  canUpload?: boolean;
}
