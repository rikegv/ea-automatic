import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type SQL, and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  SITUACOES_DA_DICA,
  type CatalogoDeFiltrosDasDicas,
  type FiltrosDasDicasDeDocumento,
  type SituacaoDaDica,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { dicasDocumento, tiposDocumento } from "../../db/schema";
import { TETO_DA_DICA, type UpsertDicaDocumentoDto } from "./dicas-documento.dto";

/**
 * A LINHA QUE A TELA DE CADASTRO MOSTRA: um TIPO ativo, com a dica dele quando existir.
 *
 * `dicaId` nulo é "este tipo ainda não tem dica", e é ele que faz a tela conseguir OFERECER o tipo
 * novo. Listar só o que tem dica seria uma tela que só mostra o trabalho já feito.
 */
export interface LinhaDeDicaDeDocumento {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  dicaId: string | null;
  texto: string | null;
  ativo: boolean | null;
  atualizadoEm: string | null;
}

/**
 * O QUE A LISTA ACEITA RECORTAR, do lado de DENTRO.
 *
 * MAIS FROUXO QUE O CONTRATO de propósito: o que chega da query string é `string[]`, e estreitar
 * isso com um `as` na controller seria afirmar sem conferir exatamente o que `situacoesValidas` e
 * `documentosValidos` existem para conferir. O estreitamento acontece aqui, medindo.
 *
 * A LINHA ABAIXO É A PROVA DE QUE O CONTRATO CABE AQUI: se `FiltrosDasDicasDeDocumento`
 * (`shared-types`, dono o coordenador, §A.39) mudar de forma, isto para de compilar em vez de
 * divergir em silêncio.
 */
export interface EntradaDeFiltrosDasDicas {
  situacoes?: string[];
  documentos?: string[];
}
const _contratoCabe: EntradaDeFiltrosDasDicas = {} as FiltrosDasDicasDeDocumento;
void _contratoCabe;

/**
 * OS RÓTULOS DAS TRÊS SITUAÇÕES. Title case (§A.24), sem travessão (§A.11).
 *
 * FIXOS, e não derivados do que existe na base: opção que some justamente no dia em que ninguém
 * está naquele estado é a forma mais cara de esconder a pergunta "e sem dica, quantos?", que é a
 * pergunta que esta tela existe para responder.
 */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaDica, string> = {
  COM_DICA: "Com Dica",
  SEM_DICA: "Sem Dica",
  DICA_INATIVA: "Dica Inativa",
};

/**
 * ══ O FILTRO DE SITUAÇÃO, E POR QUE ELE É DIFERENTE DE TODOS OS OUTROS DO SISTEMA ═════════════
 *
 * `SEM_DICA` NÃO É UM REGISTRO, É A AUSÊNCIA DELE. Este filtro não recorta linhas de uma tabela:
 * ele pergunta SE O `leftJoin` CASOU. As três situações são, literalmente:
 *
 *   COM_DICA     → casou  e  `ativo = true`
 *   DICA_INATIVA → casou  e  `ativo = false`
 *   SEM_DICA     → NÃO casou (`dicas_documento.id IS NULL`)
 *
 * ┌─ O MODO DE FALHA QUE ISTO EVITA, e ele é SILENCIOSO ────────────────────────────────────────┐
 * │ As duas saídas fáceis quebram a tela sem dar erro nenhum:                                   │
 * │                                                                                             │
 * │  1. VIRAR `innerJoin` para poder falar de `ativo` no `where`. O tipo SEM dica desapareceria  │
 * │     da lista, e é justamente ele que a tela precisa OFERECER para alguém escrever a primeira │
 * │     dica. A lista viraria "o trabalho já feito".                                             │
 * │  2. PENDURAR A CONDIÇÃO DE CASAMENTO NO `where` (`ativo = true` solto). Um `leftJoin` com    │
 * │     predicado da tabela da direita no `where` VIRA um inner join na prática, porque `NULL =  │
 * │     true` é falso: mesmo efeito do item 1, sem nenhuma pista no código de que foi isso.      │
 * │     É o achado da auditoria no join da trilha, na rodada anterior.                           │
 * │                                                                                             │
 * │ A SAÍDA CORRETA é a daqui: o `ON` do join continua sendo SÓ a igualdade das chaves, e o      │
 * │ `where` recebe um OR de predicados que tratam o NULL EXPLICITAMENTE (`isNull`/`isNotNull`).  │
 * │ Nenhum deles é um filtro de igualdade cru sobre a tabela da direita.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA SITUAÇÃO SELECIONADA devolve `undefined`, que é "sem recorte": a consulta sai IDÊNTICA à
 * de antes desta OST, e é o que faz o filtro ser aditivo sobre uma tela já validada (§A.26).
 *
 * PURA E EXPORTADA de propósito: a régua dá para provar sem banco, e é ela que o teste trava.
 */
export function predicadoDeSituacao(situacoes: SituacaoDaDica[]): SQL | undefined {
  // Deduplica: a mesma situação repetida no query string não muda a pergunta.
  const pedidas = [...new Set(situacoes)];
  if (pedidas.length === 0) return undefined;
  // As TRÊS juntas são o universo inteiro (a dica casou ativa, casou inativa, ou não casou), então
  // recortar por elas seria escrever um OR que não exclui nada. Sai como "sem recorte".
  if (pedidas.length === SITUACOES_DA_DICA.length) return undefined;

  const porSituacao: Record<SituacaoDaDica, SQL | undefined> = {
    COM_DICA: and(isNotNull(dicasDocumento.id), eq(dicasDocumento.ativo, true)),
    DICA_INATIVA: and(isNotNull(dicasDocumento.id), eq(dicasDocumento.ativo, false)),
    // A AUSÊNCIA, dita como ausência. É o único jeito de perguntar por ela sem inventar linha.
    SEM_DICA: isNull(dicasDocumento.id),
  };

  const partes = pedidas.map((s) => porSituacao[s]).filter((p): p is SQL => p !== undefined);
  return partes.length === 1 ? partes[0] : or(...partes);
}

/** Só as situações do contrato entram; lixo do cliente é descartado, nunca vira consulta. */
export function situacoesValidas(bruto: string[] | undefined): SituacaoDaDica[] {
  if (!bruto) return [];
  const conhecidas = new Set<string>(SITUACOES_DA_DICA);
  return bruto.filter((s): s is SituacaoDaDica => conhecidas.has(s));
}

/**
 * ID de `tipos_documento` é UUID, e a coluna também: mandar texto qualquer num `IN` não devolve
 * zero linhas, derruba a consulta no cast do Postgres e a tela toma 500. A forma é conferida aqui.
 */
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function documentosValidos(bruto: string[] | undefined): string[] {
  if (!bruto) return [];
  return [...new Set(bruto.filter((d) => FORMATO_UUID.test(d)))];
}

/**
 * ══ PEDIU FILTRO E NADA ERA VÁLIDO: A RESPOSTA É VAZIA, NÃO É TUDO (achado S25) ═══════════════
 *
 * ┌─ A DIFERENÇA QUE ESTA FUNÇÃO EXISTE PARA GUARDAR, e é ela que importa ─────────────────────┐
 * │ NÃO PEDIR FILTRO e PEDIR UM FILTRO QUE NÃO CASA COM NADA são perguntas DIFERENTES, e antes  │
 * │ desta correção as duas recebiam a MESMA resposta: a lista inteira. `?documentos=abc` (nenhum │
 * │ UUID) tinha os valores descartados no saneamento, a condição sumia, e a tela devolvia todos  │
 * │ os tipos como se ninguém tivesse filtrado.                                                   │
 * │                                                                                              │
 * │ NÃO É VAZAMENTO DE ESCOPO: o que voltava é exatamente o que aquela pessoa já vê sem filtro   │
 * │ nenhum. O defeito é que a resposta MENTE para quem filtrou (§A.28): ela não é o resultado da │
 * │ pergunta feita, e quem lê a tela conclui que aqueles registros casam com o filtro.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `bruto` é o que CHEGOU (o `parseMulti` já devolve `undefined` para parâmetro ausente ou vazio, e
 * é essa ausência que significa "não pediu"); `validos` é o que SOBROU do saneamento. Pedido com
 * valor e saneamento sem sobra é, literalmente, "você pediu por algo que não existe": zero linhas.
 *
 * PURA E EXPORTADA pela mesma razão de `predicadoDeSituacao`: a régua se prova sem banco.
 */
export function pediuFiltroSemValorValido(
  bruto: string[] | undefined,
  validos: readonly unknown[],
): boolean {
  return (bruto?.length ?? 0) > 0 && validos.length === 0;
}

/**
 * ══ DICAS DE DOCUMENTO: o texto que diz ao candidato como o documento tem de estar ════════════
 *
 * Uma dica por TIPO de documento (o `unique` da migration 0123 é essa regra no banco), escrita
 * pelo diretor. Mesmo molde dos catálogos vizinhos (`cargos`, `escalas`, `motivos-declinio`):
 * soft-delete por `ativo`, NUNCA exclusão física, inativar e reativar reversíveis.
 *
 * ┌─ POR QUE A ESCRITA É UPSERT POR TIPO, E NÃO `create` + `update` POR ID ─────────────────────┐
 * │ A chave de negócio é o TIPO, não o id da dica, e é assim que a tela pensa: o diretor escolhe │
 * │ "Comprovante De Residência" e escreve. Com `create`/`update` separados, a tela teria de      │
 * │ saber se já existe para escolher o verbo, e a corrida entre duas abas terminaria num 409     │
 * │ que não significa nada para quem só quer salvar um texto. O `unique` continua sendo a trava; │
 * │ o upsert é só o verbo honesto para "um tipo, uma dica".                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6, E O RISCO AQUI É O INVERSO DO USUAL ────────────────────────────────────────────────┐
 * │ Nada disto é dado de candidato: sem CPF, sem nome, sem admissão, sem e-mail. O texto é      │
 * │ CONFIGURAÇÃO escrita pelo diretor. O cuidado é o outro lado: ele é renderizado na tela      │
 * │ PÚBLICA do portal, então é tratado como CONTEÚDO A SER ESCAPADO, com teto de tamanho e sem  │
 * │ marcação. `sanitizar` é a régua, e ela é descrita lá embaixo.                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class DicasDocumentoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * TODOS OS TIPOS ATIVOS, com a dica quando houver. É a tela de cadastro inteira em uma consulta.
   *
   * SÓ OS ATIVOS, e o recorte é o mesmo da régua: tipo inativo saiu das opções, então não há o que
   * configurar nele. A dica de um tipo inativado NÃO é apagada (ela some desta lista e volta se o
   * tipo for reativado), e é por isso que o `leftJoin` é do tipo para a dica, e nunca o contrário.
   *
   * OS FILTROS (§A.28, múltiplos) SÃO ADITIVOS: sem nenhum, a consulta é a mesma de sempre. O de
   * SITUAÇÃO é o delicado, porque uma das três situações é a AUSÊNCIA da dica; a régua e o modo de
   * falha que ela evita estão em `predicadoDeSituacao`, acima.
   */
  async list(filtros?: EntradaDeFiltrosDasDicas): Promise<LinhaDeDicaDeDocumento[]> {
    const situacoes = situacoesValidas(filtros?.situacoes);
    const documentos = documentosValidos(filtros?.documentos);

    // PEDIU E NADA SOBROU DO SANEAMENTO = ZERO LINHAS (achado S25). Vale para os DOIS filtros, e
    // a régua está em `pediuFiltroSemValorValido`. O caminho SEM filtro não passa por aqui: com
    // `bruto` ausente isto é falso, `condicoes` não ganha nada e a consulta sai byte a byte igual.
    const nadaPodeCasar =
      pediuFiltroSemValorValido(filtros?.documentos, documentos) ||
      pediuFiltroSemValorValido(filtros?.situacoes, situacoes);

    // OS DOIS FILTROS SE SOMAM (E), e cada um é um OU internamente (§A.28). Ausentes, `condicoes`
    // fica só com o recorte de sempre e a consulta é IDÊNTICA à de antes desta OST.
    const condicoes: (SQL | undefined)[] = [
      eq(tiposDocumento.ativo, true),
      // A recusa é dita ao BANCO, e não devolvendo `[]` daqui: assim existe UM caminho só de
      // resposta, e o que a tela recebe é o resultado de verdade da consulta que foi pedida.
      nadaPodeCasar ? sql`false` : undefined,
      documentos.length > 0 ? inArray(tiposDocumento.id, documentos) : undefined,
      // O PREDICADO DE SITUAÇÃO trata o NULL do `leftJoin` explicitamente. Ler o porquê em
      // `predicadoDeSituacao`: é onde mora o único risco real desta consulta.
      predicadoDeSituacao(situacoes),
    ];

    const linhas = await this.db
      .select({
        tipoDocumentoId: tiposDocumento.id,
        codigo: tiposDocumento.codigo,
        nome: tiposDocumento.nome,
        dicaId: dicasDocumento.id,
        texto: dicasDocumento.texto,
        ativo: dicasDocumento.ativo,
        atualizadoEm: dicasDocumento.atualizadoEm,
      })
      .from(tiposDocumento)
      // O `ON` CONTINUA SENDO SÓ A IGUALDADE DAS CHAVES, e continuar assim é o que preserva a
      // linha do tipo SEM dica. Nada de condição de `ativo` aqui nem no `where` solto.
      .leftJoin(dicasDocumento, eq(dicasDocumento.tipoDocumentoId, tiposDocumento.id))
      .where(and(...condicoes.filter((c): c is SQL => c !== undefined)))
      .orderBy(asc(tiposDocumento.nome));

    return linhas.map((l) => ({
      ...l,
      atualizadoEm: l.atualizadoEm ? new Date(l.atualizadoEm).toISOString() : null,
    }));
  }

  /**
   * O CATÁLOGO DOS DOIS FILTROS (§A.37), servido por ENDPOINT e nunca derivado das linhas da tela.
   *
   * SITUAÇÃO sai do CONTRATO (`SITUACOES_DA_DICA`), fixa nas três. Derivá-la do que existe na base
   * tiraria "Sem Dica" da barra no dia em que todos os tipos tivessem dica, que é exatamente o dia
   * em que a resposta "nenhum" é a informação útil.
   *
   * DOCUMENTO sai de `tipos_documento` ATIVOS, e o recorte não é escolha: é O MESMO da lista, logo
   * acima. Duas razões, nesta ordem:
   *  1. OFERECER TIPO INATIVO seria oferecer uma opção que NUNCA traz linha, porque a lista já
   *     exclui o tipo inativo. Filtro que não pode casar mente para quem o usa.
   *  2. DERIVAR DAS LINHAS CARREGADAS encolheria a lista assim que o primeiro documento fosse
   *     escolhido, e não haveria como somar o segundo sem limpar o filtro (§A.37).
   * Saindo da MESMA fonte e do MESMO recorte, catálogo e lista não têm como divergir.
   *
   * §A.6: só código, nome e id de catálogo. Nada de candidato, nada de PII.
   */
  async catalogoDeFiltros(): Promise<CatalogoDeFiltrosDasDicas> {
    const tipos = await this.db
      .select({ id: tiposDocumento.id, nome: tiposDocumento.nome })
      .from(tiposDocumento)
      .where(eq(tiposDocumento.ativo, true))
      .orderBy(asc(tiposDocumento.nome));

    return {
      situacoes: SITUACOES_DA_DICA.map((valor) => ({ valor, rotulo: ROTULO_DA_SITUACAO[valor] })),
      documentos: tipos.map((t) => ({ valor: t.id, rotulo: t.nome })),
    };
  }

  /**
   * GRAVA A DICA DO TIPO (cria ou substitui). O autor é carimbado nos dois casos.
   *
   * `criado_por_id` é escrito só no nascimento e nunca reescrito: é a pergunta "quem escreveu esta
   * dica pela primeira vez", que uma edição não responde. `atualizado_por_id` é o inverso, e é o
   * que a tela mostra ao lado da data.
   */
  async upsert(tipoDocumentoId: string, dto: UpsertDicaDocumentoDto, autorId: string) {
    const texto = sanitizar(dto.texto);

    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Documento não encontrado");

    const [row] = await this.db
      .insert(dicasDocumento)
      .values({
        tipoDocumentoId,
        texto,
        ativo: dto.ativo ?? true,
        criadoPorId: autorId,
        atualizadoPorId: autorId,
      })
      // O `unique` do tipo é a chave do conflito: duas abas salvando ao mesmo tempo terminam com a
      // última gravação vencendo, que é o comportamento esperado de um campo de texto, e não com
      // uma segunda linha para o mesmo tipo.
      .onConflictDoUpdate({
        target: dicasDocumento.tipoDocumentoId,
        set: {
          texto,
          ...(dto.ativo === undefined ? {} : { ativo: dto.ativo }),
          atualizadoPorId: autorId,
          atualizadoEm: new Date(),
        },
      })
      .returning();
    return row;
  }

  /**
   * INATIVA a dica (ativo=false). NUNCA exclusão física: o texto que alguém escreveu não se perde
   * por um clique, e reativar devolve tudo. Inativa, ela some da tela do candidato e continua na
   * de cadastro, que é o par certo para "guardei, mas não estou mostrando".
   */
  async inativar(tipoDocumentoId: string, autorId: string) {
    return this.trocarAtivo(tipoDocumentoId, false, autorId);
  }

  async reativar(tipoDocumentoId: string, autorId: string) {
    return this.trocarAtivo(tipoDocumentoId, true, autorId);
  }

  /**
   * ┌─ A AUTORIA ENTRA AQUI TAMBÉM, E ISTO NÃO É SIMETRIA DE ESTILO (achado S22) ────────────────┐
   * │ Antes, este caminho MOVIA `atualizadoEm` e deixava `atualizadoPorId` parado no autor        │
   * │ ANTERIOR. A tela lê os dois lado a lado, então ela passava a dizer "atualizado hoje por     │
   * │ Fulano" quando Fulano não tinha feito nada e Beltrano é que havia republicado o texto.      │
   * │                                                                                             │
   * │ E `reativar` NÃO é um toque de estado qualquer: é um ATO DE PUBLICAÇÃO. Ele devolve o texto │
   * │ à tela PÚBLICA do candidato (a trilha exige `ativo = true` no join), e sem esta coluna não  │
   * │ havia como responder "quem republicou isto", que é metade da pergunta desta OST ("só quem   │
   * │ eu liberar escreve a dica"). A coluna já existia no schema e só não era escrita por aqui.   │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async trocarAtivo(tipoDocumentoId: string, ativo: boolean, autorId: string) {
    const [row] = await this.db
      .update(dicasDocumento)
      .set({ ativo, atualizadoPorId: autorId, atualizadoEm: new Date() })
      .where(eq(dicasDocumento.tipoDocumentoId, tipoDocumentoId))
      .returning({ id: dicasDocumento.id });
    if (!row) throw new NotFoundException("Dica não encontrada");
    return { ok: true, ativo };
  }
}

/**
 * ══ A SANITIZAÇÃO, E ELA EXISTE PORQUE O DESTINO É UMA TELA PÚBLICA ═══════════════════════════
 *
 * O React escapa o que interpola, então isto NÃO é a defesa contra injeção: é a segunda camada, e
 * ela vale porque o texto atravessa uma fronteira (API pública, consumida por uma tela que hoje é
 * React e amanhã pode ser um PDF, um e-mail ou um `dangerouslySetInnerHTML` que alguém achou
 * prático). Guardar o texto JÁ LIMPO é o que faz a limpeza valer para todos os consumidores
 * futuros, inclusive os que esquecerem de escapar.
 *
 * O QUE ELA FAZ, e nada além:
 *  1. APARA e colapsa espaço em branco, preservando a quebra de parágrafo (a dica tem itens);
 *  2. TIRA os caracteres de controle, que não se veem e servem para esconder coisa no meio do
 *     texto;
 *  3. RECUSA marcação (`<` e `>`). Nenhuma dica legítima precisa deles, e recusar é melhor que
 *     remover em silêncio: removendo, o diretor salva e descobre depois que o texto saiu
 *     diferente do que ele escreveu;
 *  4. RECUSA o vazio depois de aparar, que o `MinLength` do DTO deixaria passar como um espaço.
 *
 * O TETO É CONFERIDO DE NOVO AQUI, sobre o texto JÁ normalizado, que é o que vai para uma coluna
 * de 1000. Sem esta segunda medida, um texto no limite com muito espaço passaria no DTO e o banco
 * recusaria com um 500 cru.
 */
export function sanitizar(bruto: string): string {
  // `no-control-regex` DESLIGADO NESTA LINHA, e é o ponto inteiro dela: o alvo SÃO os caracteres
  // de controle, que é o que a regra do lint normalmente avisa ser suspeito. Aqui eles são o que
  // se quer remover antes de o texto ir para uma tela pública.
  //
  // ┌─ AS QUATRO FAIXAS, e as três últimas entraram por achado da auditoria ────────────────────┐
  // │ A primeira versão cobria só C0 e DEL, e o comentário prometia tirar "os caracteres que não │
  // │ se veem e servem para esconder coisa no meio do texto". Ela não cumpria a própria frase:   │
  // │ largura zero e controle bidirecional são exatamente isso e passavam inteiros.              │
  // │                                                                                            │
  // │  1. C0 e DEL: os controles clássicos.                                                      │
  // │  2. C1 (`\u0080-\u009F`): a segunda faixa de controle, que quase todo saneador esquece.    │
  // │  3. LARGURA ZERO (`\u200B-\u200D`, `\uFEFF`, `\u00AD`): invisíveis, partem uma palavra ao  │
  // │     meio sem deixar rastro e sobrevivem a copiar e colar.                                  │
  // │  4. BIDIRECIONAIS (`\u200E`, `\u200F`, `\u202A-\u202E`, `\u2066-\u2069`): um RLO INVERTE   │
  // │     visualmente o resto do parágrafo na tela do candidato.                                 │
  // │                                                                                            │
  // │ O MODELO DE AMEAÇA AQUI É FRACO, e é honesto dizer: quem escreve a dica já é um interno    │
  // │ com o menu, e ele engana o candidato com palavras normais sem precisar de nada invisível.  │
  // │ Entrou mesmo assim porque o custo é uma faixa a mais numa classe que já existe, e porque   │
  // │ comentário que promete mais do que o código faz é pior do que comentário nenhum.           │
  // └────────────────────────────────────────────────────────────────────────────────────────────┘
  // A DIRETIVA FICA NA LINHA DO REGEX, e não na do `replace`. `eslint-disable-next-line`
  // vale para a linha SEGUINTE e nada mais: quando o `replace` foi quebrado em várias linhas para
  // caber a classe maior, a diretiva de cima ficou apontando para o `(` e deixou de cobrir coisa
  // nenhuma. O efeito é pior do que parece, porque ela CONTINUA ALI, com cara de proteção, e a
  // regra volta a acusar sem ninguém entender o que mudou.
  const semControle = bruto.replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    "",
  );
  const texto = semControle
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((linha) => linha.trim())
    .join("\n")
    .trim();

  if (!texto) throw new BadRequestException("Escreva a dica antes de salvar.");
  if (/[<>]/.test(texto)) {
    throw new BadRequestException("A dica não pode conter os sinais < e >. Escreva só o texto.");
  }
  if (texto.length > TETO_DA_DICA) {
    throw new BadRequestException(`A dica passa de ${TETO_DA_DICA} caracteres. Encurte o texto.`);
  }
  return texto;
}
