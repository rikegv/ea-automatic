import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
} from "class-validator";
import { AS_MAXIMO_POR_LOTE } from "@ea/shared-types";

/**
 * ─ O CORPO DO ENVIO DE SHORTLIST (Frente E, pontos 10 e 11) ────────────────────────────────────
 *
 * UM CORPO SÓ PARA O ENVIO E PARA O REENVIO, e não dois, porque é o MESMO gesto: "estas pessoas
 * foram ao cliente nesta data". O que separa os dois é o `numero`, e o `numero` é DERIVADO pelo
 * servidor (`max + 1` sob a linha da vaga travada), nunca digitado. Aceitá-lo do corpo deixaria a
 * tela decidir se um envio é o primeiro, e a tela decide com a fotografia que carregou.
 *
 * §A.6: ids técnicos, uma data e uma frase de PROCESSO. Nenhum nome, nenhum CPF. A shortlist fala
 * de candidaturas por ID, e é o servidor que resolve os nomes na LEITURA.
 */
export class EnviarShortlistDto {
  /**
   * QUEM VAI NA LISTA, por id de CANDIDATURA e nunca de candidato: a shortlist é de UMA vaga, e a
   * candidatura é exatamente o par pessoa+vaga. Mandar o id da pessoa deixaria ambíguo quem está em
   * três processos ao mesmo tempo.
   *
   * `ArrayMinSize(1)`: shortlist vazia não é shortlist, é nada. Note que o MÍNIMO DE TRÊS **não**
   * está aqui e não pode estar: aquilo é AVISO, não trava (decisão do diretor), e um `@ArrayMinSize(3)`
   * transformaria em recusa o que o diretor mandou ser pergunta.
   *
   * O TETO É O MESMO DOS DEMAIS LOTES DO MÓDULO (`AS_MAXIMO_POR_LOTE`), e ele existe pela razão de
   * sempre: um corpo sem teto é um `insert` sem teto, e o `in (...)` da conferência tem limite
   * prático de parâmetros.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AS_MAXIMO_POR_LOTE)
  @IsUUID("4", { each: true })
  candidaturaIds!: string[];

  /**
   * A DATA DO ENVIO AO CLIENTE.
   *
   * OBRIGATÓRIA, E NÃO "HOJE POR PADRÃO", e a razão é a mesma que o fechamento da vaga já usa para
   * a `data_fechamento`: esta data é FATO COMERCIAL, não leitura de relógio. A lista foi ao cliente
   * na sexta e é registrada na segunda, e é o caso NORMAL. Carimbar `now()` faria o sistema afirmar
   * um dia em que nada foi enviado, e ninguém teria como corrigir depois (o conjunto é congelado).
   *
   * `IsDateString` porque a coluna é `date`: aqui não há horário a guardar. Quem tem horário é a
   * ENTREVISTA, e ela é `timestamptz` por isso.
   */
  @IsDateString()
  enviadaEm!: string;

  /**
   * POR QUE ESTÁ REENVIANDO, PELO ID DO CATÁLOGO. OBRIGATÓRIO a partir do SEGUNDO envio, PROIBIDO
   * no primeiro.
   *
   * ─ ERA TEXTO LIVRE DE 500 CARACTERES, E VIROU CATÁLOGO (decisão 6 do diretor) ────────────────
   *
   * O DEFEITO DO TEXTO LIVRE É O MESMO QUE O DESCARTE JÁ PAGOU NA 0129: o mesmo fato escrito de
   * cinco jeitos, e a pergunta "quantos reenvios por mudança de perfil?" virando um `like` sobre
   * prosa. E havia um segundo, de §A.6: frase livre digitada por consultor é onde telefone e nome
   * de parente aparecem na prática, numa tabela que a varredura de retenção não alcança (a
   * shortlist pendura na VAGA, e a varredura é chaveada por candidato).
   *
   * OPCIONAL AQUI, E EXIGIDO LÁ, pelo mesmo desenho da pretensão salarial: o DTO só sabe a FORMA, e
   * quem é "o segundo" depende de um dado que só existe no banco, sob a linha da vaga travada. O
   * service cobra, CONFERE contra a lista ATIVA do catálogo, e o CHECK
   * `ck_as_shortlists_motivo_reenvio` garante os dois lados no banco, inclusive para quem escrever
   * por fora da aplicação.
   *
   * O `@IsUUID` NÃO SUBSTITUI A CONFERÊNCIA DO SERVICE, e nem a FK substitui: o DTO garante a
   * FORMA, a FK garante que a linha EXISTE, e só a conferência contra os ATIVOS recusa o motivo que
   * o diretor tirou de circulação.
   */
  @IsOptional()
  @IsUUID("4")
  motivoReenvioId?: string;

  /**
   * A CIÊNCIA DO AVISO DE SHORTLIST CURTA: "sei que estou mandando menos de três e quero mandar".
   *
   * NASCE FALSO E TEM DE VIR NO CORPO, exatamente como o `cienteBancoComOficiaisAbertas` da
   * finalização de posição, e a mecânica é a mesma: a primeira chamada volta 409 com o NÚMERO de
   * candidatos, a tela mostra a pergunta, o consultor confirma e a MESMA chamada volta com o flag.
   *
   * AVISA, NÃO BLOQUEIA (decisão do diretor). E é justamente por não bloquear que a confirmação é
   * GRAVADA (`aviso_curta_aceito`): guarda que se atravessa sem registro não é guarda, é texto
   * (§A.3 regra 8).
   *
   * `@Transform` porque o corpo pode chegar com `"true"` de um formulário; `@IsBoolean` sozinho
   * recusaria a string.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  cienteShortlistCurta?: boolean;
}
