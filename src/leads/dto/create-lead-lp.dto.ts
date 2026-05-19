import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLeadLpDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  // ID da LandingPage (cadastrada via /admin/landing-pages)
  @IsOptional()
  @IsUUID()
  landingPageId?: string;

  // Slug do parceiro vindo do cookie tabilize_ref
  @IsOptional()
  @IsString()
  partnerSlug?: string;

  // UTMs / rastreio (frontend envia o que tem)
  @IsOptional() @IsString() utmSource?: string;
  @IsOptional() @IsString() utmMedium?: string;
  @IsOptional() @IsString() utmCampaign?: string;
  @IsOptional() @IsString() utmTerm?: string;
  @IsOptional() @IsString() utmContent?: string;
  @IsOptional() @IsString() referrerUrl?: string;
}
