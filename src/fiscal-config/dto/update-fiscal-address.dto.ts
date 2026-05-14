import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateFiscalAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  logradouro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bairro?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  cep?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/)
  codIbgeMunicipio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  municipio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  uf?: string;

  @IsOptional()
  @IsString()
  codPais?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  referencia?: string;
}
