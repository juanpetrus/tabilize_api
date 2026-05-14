import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class InutilizarNfeDto {
  @IsString()
  @Matches(/^\d{1,3}$/, { message: 'Série deve ter 1 a 3 dígitos numéricos' })
  declare serie: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare numeroInicial: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare numeroFinal: number;

  @IsString()
  @MinLength(15, { message: 'Justificativa deve ter no mínimo 15 caracteres' })
  @MaxLength(255, { message: 'Justificativa deve ter no máximo 255 caracteres' })
  declare justificativa: string;
}
