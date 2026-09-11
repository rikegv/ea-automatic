import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { VAGA_STATUS_TONS, type VagaStatusTom } from "@ea/shared-types";

/**
 * DTOs DO GERENCIADOR DE STATUS DA VAGA (A&S, onda B2).
 *
 * ┌─ O QUE NÃO EXISTE AQUI, E A AUSÊNCIA É A REGRA ────────────────────────────────────────────────┐
 * │ NÃO HÁ CAMPO `codigo`. O código é DERIVADO do rótulo na criação (`codigoDoRotulo`) e é IMUTÁVEL │
 * │ para sempre, porque é ele que fica gravado em `vagas.status` e em cada evento da trilha.        │
 * │                                                                                                 │
 * │ NÃO HÁ CAMPO `papel`. Promover um status do diretor a `ENTREGA` faria o fechamento passar a     │
 * │ mirar nele em silêncio, sem uma linha de código mudar. Papel é do sistema, e a única forma de   │
 * │ existir uma linha de papel é a semente da migration 0102.                                        │
 * │                                                                                                 │
 * │ NÃO HÁ CAMPO `encerra`. É a decisão do diretor escrita como ausência: encerrar vaga tem DUAS    │
 * │ portas com régua (fechar e cancelar), e um status marcado `encerra` seria uma terceira, sem     │
 * │ trava de candidato tratado, sem gate de Master e sem carimbo de contagem. Com o campo fora do   │
 * │ corpo, o CHECK 1 do banco nunca precisa ser acionado.                                            │
 * │                                                                                                 │
 * │ NÃO HÁ CAMPO `ativo`. Tirar e devolver de circulação tem verbo próprio, com guardas próprias.   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum campo aqui carrega dado pessoal. É catálogo de processo.
 */

/** O nome que a tela mostra. O código sai daqui na criação e nunca mais muda. */
export class CriarVagaStatusDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/**
 * EDITAR. TODOS OS CAMPOS SÃO OPCIONAIS, e o service decide QUAIS chegam a valer: na linha de papel
 * só `rotulo`, `ordem` e `tom` sobrevivem, e os três flags são DESCARTADOS em silêncio (o porquê
 * está em `VagaStatusService.atualizar`). O DTO não tem como saber o papel da linha, então ele
 * valida FORMA e deixa a AUTORIDADE onde ela mora.
 */
export class AtualizarVagaStatusDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo?: string;

  /**
   * A POSIÇÃO NA LISTA. Aceita de 1 a 999, e o teto existe só para o campo não virar um número
   * arbitrário digitado com o teclado numérico travado. Ordem repetida é feia, não é erro: o
   * desempate por `id` na consulta garante que a lista não dance a cada F5.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  ordem?: number;

  /**
   * A COR, da paleta FECHADA (`VAGA_STATUS_TONS`). Cor livre não entra: cada tom já tem par claro/escuro
   * no design system e o ÍCONE da pill é derivado do tom, então um `#hex` digitado quebraria os dois.
   */
  @IsOptional()
  @IsIn(VAGA_STATUS_TONS as unknown as string[])
  tom?: VagaStatusTom;

  /** Ainda entra gente nova numa vaga neste status? Só vale na linha do diretor. */
  @IsOptional()
  @IsBoolean()
  recebeCandidato?: boolean;

  /** A trilha de abertura pode publicar direto neste status? Só vale na linha do diretor. */
  @IsOptional()
  @IsBoolean()
  daTrilha?: boolean;

  /** Este status aparece como destino do movimento manual? Só vale na linha do diretor. */
  @IsOptional()
  @IsBoolean()
  movivelManualmente?: boolean;
}
