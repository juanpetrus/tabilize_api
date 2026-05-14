import { IsString, MaxLength, MinLength } from 'class-validator';

export class CceNfeDto {
  @IsString()
  @MinLength(15, {
    message: 'Texto de correção deve ter no mínimo 15 caracteres',
  })
  @MaxLength(1000, {
    message: 'Texto de correção deve ter no máximo 1000 caracteres',
  })
  declare textoCorrecao: string;
}
