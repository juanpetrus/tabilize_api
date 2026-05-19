import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateLandingPageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
