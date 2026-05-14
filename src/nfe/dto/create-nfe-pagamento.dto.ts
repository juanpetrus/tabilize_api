import { IsNumber, IsString, Matches, Min } from 'class-validator';

export class CreateNfePagamentoDto {
  @IsString()
  @Matches(/^(01|02|03|04|05|10|11|12|13|14|15|16|17|18|19|90|99)$/)
  declare formaPagamento: string;

  @IsNumber()
  @Min(0.01)
  declare valor: number;
}
