import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * O CORPO DO CATÁLOGO DE MOTIVOS DE DESCARTE (Frente A, ponto 7).
 *
 * O `@Transform` DE APARA VEM ANTES DO `@MinLength`, e não é preciosismo: é `plainToInstance` quem o
 * executa, ANTES da validação, então quem valida já vê o texto aparado. Sem ele, `"   "` passa com
 * três caracteres e o catálogo ganha uma linha em branco que a tela desenha como opção invisível, e
 * que passa a ser um motivo de descarte gravável. É letra por letra o defeito que a saída da
 * candidatura já pagou em 09/09 (ver o cabeçalho de `RegistrarSaidaDto.motivo`).
 *
 * O NOME É O DADO, porque é ELE que fica gravado na candidatura (e não o id): uma grafia torta aqui
 * vira trilha torta em toda pessoa descartada por este motivo.
 */
export class CriarMotivoDescarteDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  /**
   * ─ ESTE MOTIVO PEDE A PRETENSÃO SALARIAL? (Frente E, ponto 9) ────────────────────────────────
   *
   * OPCIONAL, E O PADRÃO É `false` (o default da coluna): motivo novo NÃO pede valor nenhum até
   * alguém dizer que pede. É o lado fail-closed, e ele é §A.6 antes de ser ergonomia: um default
   * `true` faria o sistema coletar dado financeiro de pessoa por omissão de quem cadastrou a linha.
   *
   * ELE ESTÁ NA CRIAÇÃO **E** NA ATUALIZAÇÃO, de propósito: cadastrar o motivo e depois abrir a
   * tela de novo para marcá-lo é um passo a mais numa decisão que já foi tomada.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  pedePretensao?: boolean;
}

/** Renomear (corrige grafia SEM trocar o motivo) e ligar/desligar a linha. Os dois são opcionais. */
export class AtualizarMotivoDescarteDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /**
   * LIGAR E DESLIGAR A MARCA DE PRETENSÃO. Reversível como o `ativo`, e pelo mesmo motivo: é uma
   * decisão de vocabulário do diretor, e decisão de vocabulário se revê.
   *
   * DESMARCAR NÃO APAGA NADA do que já foi coletado: `as_candidaturas.pretensao_salarial` guarda o
   * valor daquele desfecho, e ele continua legível. A marca governa a ESCRITA NOVA, exatamente
   * como o `ativo` governa quem aparece no seletor sem tocar no histórico.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  pedePretensao?: boolean;
}
