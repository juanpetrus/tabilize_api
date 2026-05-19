import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateLandingPageDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
