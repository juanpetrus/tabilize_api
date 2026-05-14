import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelNfeDto {
  @IsString()
  @MinLength(15, { message: 'Justificativa deve ter no mínimo 15 caracteres' })
  @MaxLength(255, { message: 'Justificativa deve ter no máximo 255 caracteres' })
  declare justificativa: string;
}
