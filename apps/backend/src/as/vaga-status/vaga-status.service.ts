import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import {
  VAGA_STATUS_PAPEIS_DE_SISTEMA,
  podeSairManualmente,
  podeSerDestinoManual,
  type VagaStatusTom,
  type VagaStatusItem,
  type VagaStatusPapel,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asVagaStatus, asVagaStatusEventos, vagas } from "../../db/schema";
// A NORMALIZAÇÃO É REUSADA, NÃO REESCRITA: duas normalizações divergem no primeiro acento, e o
// código é o valor que fica gravado na vaga e na trilha para sempre. A função já está em produção
// no catálogo do iFractal e no de etapas, e faz exatamente o que este catálogo precisa.
import { codigoDoRotulo } from "../../ifractal/ifractal-status.service";

/**
 * UMA LINHA DO CATÁLOGO, do jeito que ela sai do banco: o `VagaStatusItem` do vocabulário
 * compartilhado mais o `id`, que é o que a tela de administração usa para endereçar a linha.
 *
 * O TIPO MORA AQUI, E NÃO NO `shared-types`, POR PROCESSO: `packages/shared-types/src/index.ts` é
 * ARQUIVO DE DONO ÚNICO (§A.39), e o dono é o coordenador. O contrato de VALOR (`VagaStatusItem`,
 * os papéis, `podeSerDestinoManual`, `podeSairManualmente`) já está escrito lá e é consumido daqui;
 * o que falta é só o `id`, que é detalhe de endereçamento. Quando o dono escrever o tipo com o `id`,
 * esta interface some e nada muda em runtime.
 */
export interface AsVagaStatusLinha extends VagaStatusItem {
  id: number;
}

/**
 * ─ A RÉGUA DE STATUS: O CATÁLOGO LIDO UMA VEZ, PERGUNTÁVEL MUITAS, SEM `await` ──────────────────
 *
 * ┌─ ELA EXISTE POR CAUSA DE UMA FRASE, E A FRASE É A REGRA INTEIRA DESTA FRENTE ─────────────────┐
 * │ "O CATÁLOGO se lê ANTES da transação; o STATUS DA VAGA se lê SEMPRE sob o `SELECT ... FOR      │
 * │ UPDATE`."                                                                                      │
 * │                                                                                                │
 * │ As duas metades são fáceis de trocar por acidente. Antes desta frente, `vagaRecebeCandidato`   │
 * │ era uma função PURA: dava para chamá-la em qualquer lugar, inclusive dentro da transação, sem  │
 * │ pensar. Virando consulta ao catálogo, a tradução ingênua seria um `await` lá dentro, e o dia   │
 * │ em que esse `await` fosse buscar a VAGA junto (para "aproveitar a viagem") desfaria a correção │
 * │ de 09/09, que é ler o status da vaga sob o lock.                                                │
 * │                                                                                                │
 * │ A RÉGUA É A FORMA QUE TORNA ISSO DIFÍCIL DE ERRAR: ela é construída com UM `await`, FORA da    │
 * │ transação, e todos os seus métodos são SÍNCRONOS. Dentro da transação não há `await` de        │
 * │ catálogo para escrever, então não há por onde a leitura travada virar leitura solta.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FAIL-CLOSED EM TUDO: código desconhecido LANÇA, papel sem linha LANÇA. Nenhum método daqui tem
 * `?? algum default`, e a ausência é deliberada (ver `codigoDoPapel`).
 */
export class ReguaDeStatusDaVaga {
  private readonly porCodigo: ReadonlyMap<string, AsVagaStatusLinha>;
  private readonly porPapel: ReadonlyMap<string, AsVagaStatusLinha>;

  constructor(readonly linhas: readonly AsVagaStatusLinha[]) {
    this.porCodigo = new Map(linhas.map((l) => [l.codigo, l]));
    // SÓ OS PAPÉIS DE SISTEMA entram no índice: de `LIVRE` pode haver muitos, e indexá-lo faria
    // `codigoDoPapel("LIVRE")` devolver "algum" status do diretor, que é uma pergunta sem resposta.
    this.porPapel = new Map(
      linhas.filter((l) => l.papel !== "LIVRE").map((l) => [l.papel, l]),
    );
  }

  /**
   * A LINHA DE UM CÓDIGO. LANÇA se ele não existir no catálogo.
   *
   * LANÇAR É O COMPORTAMENTO CERTO, e não uma inconveniência a contornar: um código que não está no
   * catálogo é uma vaga que a FK RESTRICT não deveria ter deixado existir. Devolver uma linha
   * inventada ("assume que recebe candidato") transformaria uma inconsistência de banco em uma
   * TRAVA DESLIGADA, silenciosamente, exatamente no ponto em que a trava importa.
   */
  linha(codigo: string): AsVagaStatusLinha {
    const linha = this.porCodigo.get(codigo);
    if (!linha) {
      throw new BadRequestException(
        "O status desta vaga não está no catálogo de status. Recarregue a página; se continuar, avise a administração.",
      );
    }
    return linha;
  }

  /** Existe este código? Para quem precisa PERGUNTAR sem que a resposta negativa seja um erro. */
  existe(codigo: string): boolean {
    return this.porCodigo.has(codigo);
  }

  /**
   * O CÓDIGO DE UM PAPEL DE SISTEMA. LANÇA se não achar, e NUNCA cai em literal.
   *
   * ┌─ POR QUE NÃO EXISTE `?? "ENTREGUE"` AQUI, NEM PARECIDO ──────────────────────────────────────┐
   * │ Um fallback literal RESSUSCITARIA O HARDCODE que esta frente inteira existe para eliminar, e  │
   * │ o ressuscitaria no pior lugar: no caminho de exceção, onde ninguém olha. O catálogo estar     │
   * │ incompleto é problema de INSTALAÇÃO (a migration 0102 semeia os cinco papéis e RECUSA subir   │
   * │ sem eles), e o modo de falha seguro é a operação parar com uma frase que diz o que fazer.     │
   * │                                                                                                │
   * │ E TEM O CASO JÁ REGISTRADO NA CASA: constante nova de `shared-types` chega `undefined` até o  │
   * │ pacote ser buildado, e o typecheck passa. Um `codigoDoPapel(undefined)` que devolvesse a      │
   * │ primeira linha da lista gravaria um status ARBITRÁRIO numa vaga, e o defeito apareceria como  │
   * │ "a vaga fechou com o status errado", meses depois, sem ninguém suspeitar do build. Aqui ele   │
   * │ estoura na primeira chamada: `undefined` não é chave de mapa nenhum, e o `Map.get` devolve    │
   * │ `undefined`, que cai direto no `throw`. É por isso que a busca é por CHAVE e não um `find`    │
   * │ com comparação frouxa, e é por isso que NÃO há `[0]` em lugar nenhum deste arquivo.           │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  codigoDoPapel(papel: VagaStatusPapel): string {
    const linha = this.porPapel.get(papel);
    if (!linha) {
      throw new BadRequestException(
        `O catálogo de status da vaga está sem o status de ${papel}. A administração precisa recadastrá-lo antes desta operação.`,
      );
    }
    return linha.codigo;
  }

  /** Este código exerce este papel de sistema? É a pergunta de origem do fechar e do cancelar. */
  ehDoPapel(codigo: string, papel: VagaStatusPapel): boolean {
    return this.linha(codigo).papel === papel;
  }

  /** Ainda entra gente nova numa vaga neste status? Substitui `vagaRecebeCandidato`. */
  recebeCandidato(codigo: string): boolean {
    return this.linha(codigo).recebeCandidato;
  }

  /** O processo desta vaga acabou? */
  encerra(codigo: string): boolean {
    return this.linha(codigo).encerra;
  }

  /** A trilha de abertura pode GRAVAR este código? Permissão explícita, e o inativo não conta. */
  daTrilha(codigo: string): boolean {
    const linha = this.linha(codigo);
    return linha.daTrilha && linha.ativo;
  }

  /** Uma vaga NESTE status pode ser movida manualmente para outro? (só sai de quem não encerra) */
  podeSair(codigo: string): boolean {
    return podeSairManualmente(this.linha(codigo));
  }

  /** Este status pode ser DESTINO de um movimento manual? (ativo, movível e que não encerra) */
  podeEntrar(codigo: string): boolean {
    return podeSerDestinoManual(this.linha(codigo));
  }

  /** O rótulo, para a frase de recusa falar a língua da tela em vez de cuspir o código. */
  rotulo(codigo: string): string {
    return this.linha(codigo).rotulo;
  }
}

/**
 * ─ O CATÁLOGO DE STATUS DA VAGA (A&S). A LISTA É DO DIRETOR, OS PAPÉIS SÃO DO SISTEMA ───────────
 *
 * ESTE SERVIÇO É A ÚNICA PORTA DE ESCRITA do catálogo, e é isso que torna o cache abaixo defensável.
 *
 * ┌─ O QUE ELE GARANTE, e por que cada garantia mora aqui e não na tela ───────────────────────────┐
 * │ 1. O CÓDIGO É IMUTÁVEL. Derivado do rótulo na criação, nunca reescrito. É ele que está gravado │
 * │    em `vagas.status` e em cada evento de `as_vaga_status_eventos`.                             │
 * │ 2. O PAPEL É IMUTÁVEL, EM TODA LINHA, inclusive nas LIVRES. Promover um status do diretor a    │
 * │    `ENTREGA` faria o `fechar` passar a mirar nele, em silêncio, sem uma linha de código mudar. │
 * │ 3. STATUS DE PAPEL NÃO É CRIADO, NÃO É INATIVADO E NÃO É APAGADO. Só rótulo, ordem e cor.      │
 * │ 4. APAGAR UM LIVRE TEM TRÊS CAMADAS (ver `remover`), e a do meio é a que preserva o histórico. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: código, rótulo, ordem, cor, papel e quatro booleanos. Nenhum dado pessoal passa por este
 * arquivo; as contagens que ele faz sobre vagas devolvem NÚMERO, nunca id e nunca nome.
 */
@Injectable()
export class VagaStatusService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * ─ O CACHE, E POR QUE O ARGUMENTO DAS ETAPAS NÃO VALE AQUI ────────────────────────────────────
   *
   * O CATÁLOGO TEM MEIA DÚZIA DE LINHAS E MUDA UMA VEZ POR MÊS, e é lido em toda alocação, em todo
   * lote, em todo fechamento e em toda listagem. Sem cache, cada trava vira uma consulta ao banco
   * para um dado que não mudou.
   *
   * ┌─ NÃO COPIE AQUI O PARÁGRAFO DO CATÁLOGO DE ETAPAS. O ERRO NÃO CAI PARA O LADO INÓCUO ────────┐
   * │ Lá está escrito que "o erro do cache cai para o lado inócuo: no pior caso ele aceita, por até │
   * │ um minuto, uma etapa que acabou de ser inativada", e lá isso é verdade, porque etapa é        │
   * │ POSIÇÃO no funil: aceitar uma a mais move alguém para uma casa que existia agorinha.          │
   * │                                                                                                │
   * │ AQUI OS CAMPOS SÃO TRAVAS. `encerra` e `recebe_candidato` decidem se uma vaga recebe gente e  │
   * │ se o processo dela acabou. Servir por 60 segundos um código cujo `recebe_candidato` acabou de │
   * │ ser desligado é ACEITAR CANDIDATO EM VAGA QUE NÃO RECEBE, que é o furo fechado em 09/09       │
   * │ (auditoria da finalização de posição). O erro cai para o lado que dói.                        │
   * │                                                                                                │
   * │ ENTÃO O QUE SEGURA A CORREÇÃO É A INVALIDAÇÃO, NÃO O RELÓGIO: a porta de escrita é UMA SÓ,    │
   * │ toda mutação passa por um método desta classe e todo método de mutação chama `invalidar()`.   │
   * │ O TTL é rede para o que a aplicação NÃO vê (um `UPDATE` por SQL cru, uma segunda instância do │
   * │ processo), e é por isso que ele é curto e não longo. Se um dia o backend rodar em mais de uma │
   * │ instância, esta janela deixa de ser teórica e o cache precisa de invalidação entre processos. │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * FALHA DE LEITURA LANÇA, e não existe `try/catch` neste caminho de propósito: um catálogo que não
   * pôde ser lido não é "um catálogo vazio" nem "o catálogo de antes". Devolver default permissivo
   * seria desligar todas as travas justamente no minuto em que o banco está com problema. Fail-closed
   * aqui significa a operação parar, alto e visível, em vez de seguir sem régua.
   */
  private cache: { em: number; linhas: AsVagaStatusLinha[] } | null = null;
  private static readonly TTL_MS = 60_000;

  private invalidar(): void {
    this.cache = null;
  }

  /** TODAS as linhas, ativas e inativas, na ordem da tela. É a base de tudo que se lê daqui. */
  private async todos(): Promise<AsVagaStatusLinha[]> {
    const agora = Date.now();
    if (this.cache && agora - this.cache.em < VagaStatusService.TTL_MS) return this.cache.linhas;

    const linhas = await this.db
      .select({
        id: asVagaStatus.id,
        codigo: asVagaStatus.codigo,
        rotulo: asVagaStatus.rotulo,
        ordem: asVagaStatus.ordem,
        tom: asVagaStatus.tom,
        ativo: asVagaStatus.ativo,
        papel: asVagaStatus.papel,
        encerra: asVagaStatus.encerra,
        recebeCandidato: asVagaStatus.recebeCandidato,
        daTrilha: asVagaStatus.daTrilha,
        movivelManualmente: asVagaStatus.movivelManualmente,
      })
      .from(asVagaStatus)
      // O DESEMPATE POR `id` NÃO É DETALHE: sem ele, dois status com a mesma `ordem` trocam de lugar
      // a cada consulta, e a tela mostra a lista numa ordem diferente a cada F5.
      .orderBy(asc(asVagaStatus.ordem), asc(asVagaStatus.id));

    const mapeadas: AsVagaStatusLinha[] = linhas.map((l) => ({
      ...l,
      tom: l.tom as VagaStatusTom,
      papel: l.papel as VagaStatusPapel,
    }));
    this.cache = { em: agora, linhas: mapeadas };
    return mapeadas;
  }

  /**
   * A RÉGUA, que é como o resto do sistema consome este catálogo.
   *
   * LIDA ANTES DA TRANSAÇÃO, SEMPRE, e usada síncrona lá dentro: ver o cabeçalho de
   * `ReguaDeStatusDaVaga`. Este é o único `await` de catálogo que os fluxos de vaga precisam.
   */
  async regua(): Promise<ReguaDeStatusDaVaga> {
    return new ReguaDeStatusDaVaga(await this.todos());
  }

  /**
   * A LISTA que a leitura devolve. ATIVOS por padrão; `incluirInativos` existe para o HISTÓRICO
   * conseguir resolver o rótulo de um status que saiu de circulação, sem a linha do tempo passar a
   * mostrar o código cru para as vagas que passaram por ele.
   */
  async listar(incluirInativos = false): Promise<AsVagaStatusLinha[]> {
    const todos = await this.todos();
    return incluirInativos ? todos : todos.filter((s) => s.ativo);
  }

  /** Atalho para quem só precisa do código de um papel e não vai fazer mais nada com a régua. */
  async codigoDoPapel(papel: VagaStatusPapel): Promise<string> {
    return (await this.regua()).codigoDoPapel(papel);
  }

  // ── ESCRITA ───────────────────────────────────────────────────────────────

  /**
   * CRIAR UM STATUS DO DIRETOR. NASCE SEMPRE `LIVRE`, e não existe caminho para nascer diferente.
   *
   * ┌─ POR QUE O `papel` NÃO É CAMPO DO CORPO, E NEM SEQUER É PARÂMETRO ─────────────────────────┐
   * │ O ÍNDICE PARCIAL ÚNICO do banco barra o SEGUNDO status de um papel de sistema, e só o        │
   * │ segundo. Ele não tem como opinar sobre o PRIMEIRO num banco onde alguém tenha apagado a      │
   * │ linha original (coisa que as guardas daqui impedem, mas guardas são código e código muda).   │
   * │ Recusar aqui é a camada que fecha isso sem depender do estado da tabela: papel é do sistema, │
   * │ ponto, e a tela nem oferece o campo.                                                          │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O CASO QUE FARIA ISTO VIRAR 500 SE NINGUÉM PENSASSE NELE: RECRIAR UM STATUS INATIVADO. O código
   * é derivado do rótulo, então digitar "Stand By" de novo produz `STAND_BY`, que continua existindo
   * (inativado, segurando o rótulo do histórico das vagas que passaram por ele). A recusa DIZ O QUE
   * FAZER ("Reative-o"), e NÃO reativa sozinha: reativar traz junto o histórico inteiro, e essa é
   * decisão de quem opera, não efeito colateral de ter digitado um nome parecido.
   *
   * OS FLAGS DE NASCIMENTO, e cada um é uma decisão:
   *  - `encerra: false`  OBRIGATÓRIO. É o CHECK 1 do banco, e a regra do diretor: encerrar vaga tem
   *    duas portas com régua, e um status novo não é uma terceira.
   *  - `daTrilha: false`  FAIL-CLOSED, no molde das etapas: status novo no vocabulário nasce
   *    RECUSADO pela trilha de abertura até alguém decidir o contrário.
   *  - `recebeCandidato: true`  NASCE COMO OS STATUS VIVOS DE HOJE. Todo status que não encerra
   *    recebe candidato hoje (`STATUS_QUE_NAO_RECEBEM` enumera só os três terminais), e nascer
   *    diferente seria a fábrica inventando uma trava que ninguém pediu. Quem quiser um "Stand By"
   *    que não capta gente desliga o flag na mesma tela.
   *  - `movivelManualmente: true`  É A ÚNICA PORTA DE ENTRADA DELE. Um status do diretor não é
   *    escrito pelo fechamento, nem pelo cancelamento, nem pela trilha: se ele nascer não-movível,
   *    nasce INALCANÇÁVEL, e a primeira coisa que a pessoa faria seria ligar o flag. Nascer
   *    alcançável não afrouxa nada: `podeSerDestinoManual` confere ativo, movível e que não encerra,
   *    e as três continuam valendo.
   */
  async criar(dto: { rotulo: string }): Promise<AsVagaStatusLinha> {
    const rotulo = dto.rotulo.trim();
    if (!rotulo) throw new BadRequestException("Informe o nome do status.");

    const codigo = codigoDoRotulo(rotulo);
    if (!codigo) throw new BadRequestException("O nome precisa ter ao menos uma letra ou número.");

    const existente = (await this.listar(true)).find((s) => s.codigo === codigo);
    if (existente?.ativo) throw new BadRequestException("Já existe um status com esse nome.");
    if (existente) {
      throw new BadRequestException(
        `Existe um status inativo com este nome ("${existente.rotulo}"). Reative-o em vez de criar outro, para o histórico das vagas que passaram por ele continuar apontando para o mesmo status.`,
      );
    }

    // NASCE NO FIM DA LISTA, como os demais catálogos da casa: quem quiser no meio reordena depois.
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${asVagaStatus.ordem}), 0)::int` })
      .from(asVagaStatus);

    try {
      const [criado] = await this.db
        .insert(asVagaStatus)
        .values({
          codigo,
          rotulo,
          ordem: max + 1,
          tom: "nt",
          ativo: true,
          papel: "LIVRE",
          encerra: false,
          recebeCandidato: true,
          daTrilha: false,
          movivelManualmente: true,
        })
        .returning();
      this.invalidar();
      return this.mapear(criado);
    } catch {
      // A CORRIDA: dois cliques ao mesmo tempo passam os dois pela consulta acima. O unique do banco
      // é quem decide, e a frase que chega na tela é a mesma da checagem otimista.
      this.invalidar();
      throw new BadRequestException("Já existe um status com esse nome.");
    }
  }

  /**
   * ─ EDITAR. O QUE PODE MUDAR DEPENDE DO PAPEL, E O CÓDIGO E O PAPEL NUNCA MUDAM ─────────────────
   *
   * ┌─ NA LINHA DE PAPEL, SÓ RÓTULO, ORDEM E COR. O RESTO É DESCARTADO, NÃO RECUSADO ─────────────┐
   * │ E ISSO É DELIBERADO: o corpo que chega com um flag a mais é a tela velha de alguém, não um   │
   * │ ataque; recusar a requisição inteira transformaria "renomear Entregue" em erro por causa de  │
   * │ um campo que a tela nem devia ter mandado. O que não pode é o flag ENTRAR.                    │
   * │                                                                                              │
   * │ O QUE CADA FLAG FARIA SE ENTRASSE, e nenhum é hipotético:                                    │
   * │  - `recebeCandidato` no status de ENTREGA/FECHAMENTO/CANCELAMENTO: vaga encerrada voltando a │
   * │    receber alocação. É o furo de 09/09, reaberto por um clique de configuração.               │
   * │  - `movivelManualmente` no status de ABERTURA: DESLIGÁ-LO faz toda vaga que estiver num       │
   * │    status do diretor virar ZUMBI PERMANENTE, porque fechar e cancelar exigem o papel          │
   * │    ABERTURA e o caminho de volta deixa de existir.                                            │
   * │  - `daTrilha` no status de ENTREGA: a trilha de abertura voltaria a ser uma segunda porta     │
   * │    para o estado terminal, que é o achado bloqueante de 08/09.                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `papel` NÃO É CAMPO DO DTO em nenhuma linha, LIVRE inclusive, e a ausência é a garantia: um
   * status do diretor promovido a `ENTREGA` viraria o alvo do `fechar` sem uma linha de código
   * mudar, e o `codigoDoPapel("ENTREGA")` passaria a devolver outra coisa da noite para o dia. O
   * `encerra` também não é campo, pela mesma lógica: com ele fora do corpo, o CHECK 1 do banco nunca
   * precisa ser acionado, e o diretor não tem como criar um status que encerra vaga.
   *
   * `ativo` TAMBÉM NÃO ENTRA POR AQUI: tirar e devolver de circulação tem verbo próprio
   * (`inativar` / `reativar`), com as guardas próprias.
   */
  async atualizar(
    id: number,
    dto: {
      rotulo?: string;
      ordem?: number;
      tom?: VagaStatusTom;
      recebeCandidato?: boolean;
      daTrilha?: boolean;
      movivelManualmente?: boolean;
    },
  ): Promise<AsVagaStatusLinha> {
    const alvo = (await this.todos()).find((s) => s.id === id);
    if (!alvo) throw new NotFoundException("Status não encontrado.");

    const campos: Record<string, unknown> = {};

    if (dto.rotulo !== undefined) {
      const rotulo = dto.rotulo.trim();
      if (!rotulo) throw new BadRequestException("Informe o nome do status.");
      // O CÓDIGO NÃO MUDA, e é isso que faz o histórico inteiro daquele status passar a exibir o
      // nome novo: é o MESMO status, com o nome corrigido, e não um segundo.
      campos.rotulo = rotulo;
    }
    if (dto.ordem !== undefined) campos.ordem = dto.ordem;
    if (dto.tom !== undefined) campos.tom = dto.tom;

    if (alvo.papel === "LIVRE") {
      if (dto.recebeCandidato !== undefined) campos.recebeCandidato = dto.recebeCandidato;
      if (dto.daTrilha !== undefined) campos.daTrilha = dto.daTrilha;
      if (dto.movivelManualmente !== undefined) campos.movivelManualmente = dto.movivelManualmente;
    }

    if (Object.keys(campos).length === 0) {
      // NADA A GRAVAR NÃO É ERRO: é o corpo que só trazia flags de uma linha de papel, e todos foram
      // descartados. Devolver a linha como está é o que a tela precisa para se corrigir sozinha.
      return alvo;
    }

    const [upd] = await this.db
      .update(asVagaStatus)
      .set({ ...campos, atualizadoEm: new Date() })
      .where(eq(asVagaStatus.id, id))
      .returning();
    if (!upd) {
      this.invalidar();
      throw new NotFoundException("Status não encontrado.");
    }
    this.invalidar();
    return this.mapear(upd);
  }

  /**
   * ─ INATIVAR: TIRAR DE CIRCULAÇÃO SEM APAGAR ────────────────────────────────────────────────────
   *
   * AS DUAS RECUSAS, NESTA ORDEM:
   *  1. NÃO É LINHA DE PAPEL. Inativar a linha do papel ABERTURA significa "nenhuma vaga fecha nem
   *     cancela mais" (as duas portas exigem a vaga em abertura) e "nenhuma vaga nova é publicada".
   *     O banco recusa junto (CHECK 4), e a recusa aqui é a que tem frase.
   *  2. NÃO TEM VAGA VIVA DENTRO, com o NÚMERO na frase. É a decisão do diretor de 10/09 sobre as
   *     etapas, aplicada ao nascer: inativar um status cheio produz o STATUS FANTASMA, com vagas
   *     apontando para um código que sumiu do seletor, do filtro e da tela. Elas não param de
   *     existir, param de ser alcançáveis, e é pior do que apagar porque nada falha.
   *
   * NÃO SE MOVE NENHUMA VAGA AUTOMATICAMENTE: "inativar o Stand By manda todo mundo para Aberta" é
   * irreversível, silencioso, e escreveria na trilha de cada vaga um movimento que ninguém decidiu.
   * O movimento existe e é de quem opera (`PATCH /as/vagas/:id/status`).
   *
   * NÃO PRECISA DA TRAVA DE "ÚLTIMO ATIVO" que o catálogo de etapas tem, e isso é consequência do
   * CHECK 4: as cinco linhas de papel são inativáveis por ninguém, então a lista NUNCA fica vazia.
   *
   * IDEMPOTENTE PARA O QUE JÁ ESTÁ INATIVO: o clique repetido pede um estado que já é verdade. A
   * CONTAGEM, essa, não olha `alvo.ativo`: o status já inativo com vaga dentro É o fantasma, e ele é
   * recusado nos dois verbos, com a frase que diz o caminho.
   */
  async inativar(id: number): Promise<AsVagaStatusLinha> {
    const alvo = (await this.todos()).find((s) => s.id === id);
    if (!alvo) throw new NotFoundException("Status não encontrado.");
    this.exigirLivre(alvo, "inativar");
    await this.exigirStatusSemVaga(alvo.codigo, "inativar");

    const [upd] = await this.db
      .update(asVagaStatus)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(asVagaStatus.id, id))
      .returning();
    // A LINHA PODE TER SUMIDO entre a leitura (servida de cache) e a escrita. O cache invalida junto
    // para a próxima leitura não insistir no mundo antigo.
    if (!upd) {
      this.invalidar();
      throw new NotFoundException("Status não encontrado.");
    }
    this.invalidar();
    return this.mapear(upd);
  }

  /** REATIVAR. Preserva o código, então o histórico dele segue apontando certo. */
  async reativar(id: number): Promise<AsVagaStatusLinha> {
    const [upd] = await this.db
      .update(asVagaStatus)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(asVagaStatus.id, id))
      .returning();
    if (!upd) {
      this.invalidar();
      throw new NotFoundException("Status não encontrado.");
    }
    this.invalidar();
    return this.mapear(upd);
  }

  /**
   * ─ APAGAR UM STATUS: TRÊS CAMADAS, NESTA ORDEM (molde do catálogo de etapas) ───────────────────
   *
   * ANTES DAS TRÊS, A TRAVA DE PAPEL: linha de sistema não se apaga. Apagar a do papel FECHAMENTO
   * faria `codigoDoPapel("FECHAMENTO")` lançar na próxima vaga que alguém tentasse fechar, e o
   * índice parcial único não protege contra a AUSÊNCIA, só contra a duplicata. A FK RESTRICT também
   * recusaria enquanto houvesse vaga fechada apontando para lá, mas "enquanto houver" não é garantia.
   *
   * ┌─ 1. TEM VAGA NESTE STATUS: RECUSA, COM O NÚMERO NA FRASE ─────────────────────────────────────┐
   * │ O número diz o TAMANHO DO TRABALHO: mover 3 é agora, mover 40 é outra conversa. E NÃO SE MOVE │
   * │ NINGUÉM AUTOMATICAMENTE, pelo mesmo motivo escrito no `inativar`.                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ 2. NENHUMA VAGA AGORA, MAS HÁ TRILHA: NÃO APAGA, INATIVA ────────────────────────────────────┐
   * │ Alguma vaga JÁ PASSOU por este status, e os eventos de `as_vaga_status_eventos` apontam para  │
   * │ o código nos dois lados (`de` e `para`). O status some dos seletores e CONTINUA resolvendo o  │
   * │ rótulo da linha do tempo de quem passou por ele. Pela FK RESTRICT, nem por SQL cru alguém     │
   * │ apaga, e a frase de retorno precisa DIZER isso, senão vira chamado de "o apagar não funciona".│
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ 3. ZERO VAGAS E ZERO TRILHA: APAGA DE VERDADE ───────────────────────────────────────────────┐
   * │ É o caso do primeiro dia: criou "Stand By" com erro de digitação e quer sumir com ele.        │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async remover(id: number): Promise<{ removido: boolean; inativado: boolean; mensagem: string }> {
    const alvo = (await this.todos()).find((s) => s.id === id);
    if (!alvo) throw new NotFoundException("Status não encontrado.");
    this.exigirLivre(alvo, "remover");

    // CAMADA 1.
    await this.exigirStatusSemVaga(alvo.codigo, "remover");

    // CAMADA 2 x 3: sobrou rastro? Conta os eventos da trilha, dos DOIS lados.
    const [{ eventos }] = await this.db
      .select({ eventos: sql<number>`count(*)::int` })
      .from(asVagaStatusEventos)
      .where(
        sql`${asVagaStatusEventos.para} = ${alvo.codigo} or ${asVagaStatusEventos.de} = ${alvo.codigo}`,
      );

    if (eventos > 0) {
      if (!alvo.ativo) {
        return { removido: false, inativado: true, mensagem: "Este status já estava inativo." };
      }
      await this.db
        .update(asVagaStatus)
        .set({ ativo: false, atualizadoEm: new Date() })
        .where(eq(asVagaStatus.id, id));
      this.invalidar();
      return {
        removido: false,
        inativado: true,
        mensagem:
          "Este status foi desativado em vez de apagado, porque há vagas que já passaram por ele. Ele sai dos seletores e dos filtros e continua identificando o histórico de quem passou.",
      };
    }

    await this.db.delete(asVagaStatus).where(eq(asVagaStatus.id, id));
    this.invalidar();
    return { removido: true, inativado: false, mensagem: "Status removido." };
  }

  /**
   * A TRAVA DE PAPEL, EM UM PONTO SÓ, e o `papel` na frase é o que faz a recusa ser entendida: quem
   * lê "Este status é o que o sistema grava no FECHAMENTO" sabe por que o botão não obedeceu.
   */
  private exigirLivre(alvo: AsVagaStatusLinha, verbo: "inativar" | "remover"): void {
    if (alvo.papel === "LIVRE") return;
    throw new BadRequestException(
      `Este status é o que o sistema grava no papel de ${alvo.papel}, então ele não pode ser removido nem inativado: sem ele, a operação correspondente para de funcionar. Você pode renomeá-lo, mudar a cor e a ordem. (Papéis de sistema: ${VAGA_STATUS_PAPEIS_DE_SISTEMA.join(", ")}. Verbo recusado: ${verbo}.)`,
    );
  }

  /**
   * A CAMADA 1, EM UM PONTO SÓ: não se tira de circulação um status com VAGA DENTRO.
   *
   * A CONTAGEM É SOBRE `vagas.status` DIRETO, e não sobre uma noção de "vaga viva": vaga ENCERRADA
   * também aponta para o código, e apagar o status debaixo dela deixaria o histórico sem rótulo. A
   * FK RESTRICT diria a mesma coisa, em erro de banco; esta é a que traz o NÚMERO e a frase.
   *
   * §A.6: devolve NÚMERO. Nunca id de vaga, nunca nome de candidato.
   */
  private async exigirStatusSemVaga(
    codigo: string,
    verbo: "inativar" | "remover",
  ): Promise<void> {
    const [{ quantas }] = await this.db
      .select({ quantas: sql<number>`count(*)::int` })
      .from(vagas)
      .where(eq(vagas.status, codigo));
    if (quantas > 0) {
      throw new BadRequestException(
        `${quantas} ${quantas === 1 ? "vaga está" : "vagas estão"} neste status. Mova ${quantas === 1 ? "essa vaga" : "essas vagas"} para outro status antes de ${verbo}.`,
      );
    }
  }

  /** A linha crua do banco virando a linha do catálogo. Os dois `as` são os dois CHECKs do banco. */
  private mapear(l: typeof asVagaStatus.$inferSelect): AsVagaStatusLinha {
    return {
      id: l.id,
      codigo: l.codigo,
      rotulo: l.rotulo,
      ordem: l.ordem,
      tom: l.tom as VagaStatusTom,
      ativo: l.ativo,
      papel: l.papel as VagaStatusPapel,
      encerra: l.encerra,
      recebeCandidato: l.recebeCandidato,
      daTrilha: l.daTrilha,
      movivelManualmente: l.movivelManualmente,
    };
  }
}
