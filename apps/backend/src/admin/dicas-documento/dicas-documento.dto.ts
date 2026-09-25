import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * O TETO DE 1000 CARACTERES É O MESMO DA COLUNA (migration 0123), e ele é de segurança, não de
 * arrumação: este texto é renderizado na tela PÚBLICA do candidato. Sem teto, um texto colado sem
 * querer (um relatório inteiro, um dump) vira carga na página que o candidato abre no 4G, e vira
 * superfície para pôr lá dentro coisa que ninguém quis publicar. Mil caracteres são folgados para
 * a frase que o diretor escreve ("foto legível, sem corte, com os dois lados") e curtos o
 * suficiente para ninguém colar um documento.
 *
 * O TAMANHO É CONFERIDO AQUI **E** NO SERVIÇO, de propósito: o DTO mede o que CHEGOU, o serviço
 * mede o que VAI SER GRAVADO (depois de aparar e normalizar). São medidas diferentes do mesmo
 * limite, e é a segunda que o banco vê.
 */
export const TETO_DA_DICA = 1000;

export class UpsertDicaDocumentoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TETO_DA_DICA)
  texto!: string;

  /** Opcional no upsert: omitido, a dica nasce ativa e a existente preserva o que já era. */
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
