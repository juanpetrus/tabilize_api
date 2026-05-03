import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFileDto {
  @IsOptional()
  @IsString()
  name?: string; // Se não informado, usa o nome do arquivo

  @IsOptional()
  @IsString()
  path?: string; // Caminho da pasta (default: "/")

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  competenceMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  competenceYear?: number;
}
