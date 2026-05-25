import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

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

  // Identificador da LandingPage: aceita o UUID cadastrado via
  // /admin/landing-pages OU uma chave semântica da página (ex:
  // "lp_planilha_precificacao"). Se não for um UUID válido, a chave é
  // guardada em sourceData.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  landingPageId?: string;

  // Faixa de clientes selecionada no form da LP (ex: "ate_20").
  // Persistido em sourceData (não há coluna dedicada).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  clientes?: string;

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
