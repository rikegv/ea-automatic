import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  montarMapaDePara,
  nomeComparavelDeCliente,
  normalizarCodigoDeVaga,
  type LinhaDoDeParaDeCliente,
} from "../../domain/as-depara-cliente-vaga";
import {
  agregarStatusDaPlanilha,
  type StatusDePlanilhaCanonico,
} from "../../domain/as-planilha-status-vaga";
import {
  agregarPrePreenchimentoPorCodigo,
  temAlgoAPrePreencher,
  CAMPOS_DO_PRE_PREENCHIMENTO,
  type CatalogosDoPrePreenchimento,
  type ValoresDoPrePreenchimento,
} from "../../domain/as-planilha-prepreenchimento";
import {
  proporCasamentoDeCliente,
  type ClienteDoCatalogo,
  type TipoDeCasamentoDeCliente,
} from "../../domain/as-depara-cliente-nome";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "./depara-cliente.fonte";
import {
  FalhaDaPlanilhaViva,
  PlanilhaVivaService,
  VARIAVEL_DO_ARQUIVO_DA_PLANILHA,
  type FamiliaDeFalhaDaPlanilha,
} from "./planilha-viva.service";

/**
 * ─ O CATÁLOGO DO DE/PARA DE CLIENTE: A FÁBRICA PROPÕE, O TIME CONFIRMA ─────────────────────────
 *
 * Princípio 7 do mapa de alcance, na letra: tudo que a fábrica pode fazer sozinha, ela faz, e o time
 * nunca monta do zero. A sincronização lê a planilha viva, desdobra as 3.532 linhas em uma linha por
 * código e PROPÕE o cliente do catálogo; o time só CONFERE e corrige na tela.
 *
 * ┌─ O QUE SAI DAQUI É PROPOSTA, E PROPOSTA NÃO DECIDE NADA ─────────────────────────────────────┐
 * │ Nada neste arquivo escreve `vagas.cod_cliente`, e não existe caminho daqui até lá. O único     │
 * │ consumidor desta tabela é `as/ingestao-pandape/ingestao-depara-cliente.service.ts`, que grava   │
 * │ as colunas INERTES da proposta. Quem escreve o cliente da vaga continua sendo a LIBERAÇÃO, com │
 * │ autor, data e trilha.                                                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS REGRAS DE ESCRITA DESTA SINCRONIZAÇÃO, E AS TRÊS SÃO FAIL-CLOSED ───────────────────┐
 * │ 1. ELA SÓ ESCREVE DEPOIS DE UMA LEITURA COMPLETA. Falha de leitura (503, 422, 413, serviço     │
 * │    fora do ar) NÃO apaga, NÃO desliga e NÃO invalida o que já está gravado: planilha ilegível  │
 * │    hoje não pode destruir a proposta de ontem;                                                 │
 * │ 2. ELA NUNCA RELIGA UMA LINHA DESLIGADA. `ativo = true` é gesto humano, e uma sincronização    │
 * │    que religasse desfaria a decisão do diretor de 30 em 30 minutos. Ela PODE desligar, e só num │
 * │    caso: a planilha passou a dizer DUAS coisas sobre aquele código (ver a ambiguidade abaixo);  │
 * │ 3. ELA NUNCA TOCA UMA LINHA CONFIRMADA. O vínculo que uma pessoa carimbou, com autor e data,    │
 * │    não é recalculado pelo palpite da fábrica. A exceção é o nome MUDAR na planilha, e aí a      │
 * │    confirmação CAI, porque ela era sobre outro cliente.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA CRIA LINHA EM `clientes`: aquele catálogo é da ADMISSÃO, resolve a régua documental e a pasta
 * do Drive, e o único escritor dele é `admin/clientes/clientes.service.ts`, atrás do menu ADMIN.
 * Dos 95 nomes medidos, 59 não existem lá, e quem os resolve é a administração, na tela de Clientes.
 *
 * §A.6: o log desta classe é CONTAGEM. Nenhum código da planilha, nenhum nome de cliente e nenhuma
 * linha do corpo entram em log, em nenhum nível. A tabela guarda o código e o nome do cliente, e
 * NENHUMA outra coluna da planilha: cópia de dado pessoal fora do alcance do expurgo é o defeito.
 */

/** TODO CAMPO É NÚMERO, menos a família da falha, que é um RÓTULO fechado (§A.6). */
export interface ResumoDaSincronizacaoDoDePara {
  /** Linhas úteis que o outro lado contou. */
  linhasLidas: number;
  /** Chaves distintas que viraram linha utilizável. */
  chaves: number;
  linhasCriadas: number;
  linhasAtualizadas: number;
  /** Linhas desligadas porque a planilha passou a dizer duas coisas sobre o mesmo código. */
  linhasDesligadasPorAmbiguidade: number;
  /** Confirmações que caíram porque o NOME do cliente mudou na planilha. */
  confirmacoesDesfeitasPorTrocaDeNome: number;
  /** Texto que não é chave nem família conhecida. Linha para o time consertar na planilha. */
  malformados: number;
  /** Família `SL...`: código INTERNO do EA, que nunca vai casar, e não é erro de ninguém. */
  codigosInternos: number;
  /** Célula de código em branco. É o normal de 868 linhas medidas, e não é erro. */
  vazios: number;
  /** Códigos com duas respostas na planilha. Abstém-se, e conta. */
  ambiguos: number;
  /** Palpites EXATOS e por PREFIXO que a fábrica propôs nesta passada, à espera de confirmação. */
  palpitesExatos: number;
  palpitesPorPrefixo: number;
  /** Nomes para os quais a fábrica NÃO propôs nada. 59 dos 95 não existem no catálogo da Admissão. */
  semPalpite: number;
  /**
   * Códigos para os quais a planilha deu ALGUM valor pré-preenchível (tipo, célula, cargo ou data).
   *
   * É CONTAGEM DE CÓDIGO, não de campo: a pergunta que ela responde é "o pré-preenchimento está
   * chegando?", e ela é o que distingue "a planilha não tem as colunas novas" de "a leitura
   * parou". §A.6: número, e nenhum valor.
   */
  prePreenchimentosComValor: number;
  /**
   * Pares (código + campo) que se ABSTIVERAM porque a planilha disse DUAS coisas sobre o mesmo
   * código naquele campo. Medido: 37 códigos com dois tipos, 29 com duas células, 49 com dois
   * cargos. Contar isto é o que torna a abstenção VISÍVEL em vez de silenciosa.
   */
  prePreenchimentosAmbiguosPorCampo: number;
  /** Preenchida só quando a leitura falhou. Nada foi escrito, e nada foi apagado. */
  falha?: FamiliaDeFalhaDaPlanilha;
}

/** Uma linha do catálogo, como a tela de curadoria a recebe. */
export interface ItemDoDeParaDeCliente {
  id: number;
  codigoExterno: string;
  nomeCliente: string;
  codCliente: string | null;
  /** O nome do cliente NO CATÁLOGO do EA, quando o código resolve. Nulo é código órfão. */
  clienteDoCatalogo: string | null;
  casamento: TipoDeCasamentoDeCliente | null;
  confirmado: boolean;
  confirmadoEm: string | null;
  ativo: boolean;
}

@Injectable()
export class DeParaClienteService {
  private readonly logger = new Logger("DeParaClienteService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly planilha: PlanilhaVivaService,
  ) {}

  // ── LEITURA ──────────────────────────────────────────────────────────────────────────────────

  /**
   * A FILA DE CURADORIA. O padrão é o que falta CONFIRMAR, porque é isso que a tela existe para
   * resolver; o conjunto inteiro é alcançável com `apenasPendentes = false`.
   *
   * O NOME DO CLIENTE DO CATÁLOGO VEM POR JUNÇÃO, e não gravado: é o que permite a tela mostrar
   * "este código não está (mais) no cadastro" sem a tabela guardar uma cópia que envelhece.
   */
  async listar(opcoes?: { apenasPendentes?: boolean }): Promise<ItemDoDeParaDeCliente[]> {
    const apenasPendentes = opcoes?.apenasPendentes !== false;
    const linhas = (await this.db.execute(sql`
      select d.id,
             d.codigo_externo,
             d.nome_cliente,
             d.cod_cliente,
             d.casamento,
             d.confirmado_em,
             d.ativo,
             coalesce(c.nome_operacao, c.razao_social) as cliente_do_catalogo
        from as_depara_cliente_vaga d
        left join clientes c on c.cod_cliente = d.cod_cliente
       where d.fonte = ${FONTE_DO_DEPARA_DE_CLIENTE}
         and (${apenasPendentes} = false or d.confirmado_em is null)
       order by d.confirmado_em nulls first, d.nome_cliente asc, d.codigo_externo asc
       limit 2000
    `)) as unknown as {
      id: number;
      codigo_externo: string;
      nome_cliente: string;
      cod_cliente: string | null;
      casamento: string | null;
      confirmado_em: Date | string | null;
      ativo: boolean;
      cliente_do_catalogo: string | null;
    }[];
    return linhas.map((l) => ({
      id: l.id,
      codigoExterno: l.codigo_externo,
      nomeCliente: l.nome_cliente,
      codCliente: l.cod_cliente,
      clienteDoCatalogo: l.cliente_do_catalogo,
      casamento: (l.casamento ?? null) as TipoDeCasamentoDeCliente | null,
      confirmado: l.confirmado_em !== null,
      confirmadoEm: l.confirmado_em === null ? null : new Date(l.confirmado_em).toISOString(),
      ativo: l.ativo,
    }));
  }

  // ── O CAMINHO HUMANO ─────────────────────────────────────────────────────────────────────────

  /**
   * CONFIRMAR O VÍNCULO: autor e data DA SESSÃO, nunca do corpo.
   *
   * ┌─ POR QUE O AUTOR NÃO PODE VIR DO CORPO, e é a mesma régua do `adotarAts` ──────────────────┐
   * │ Autoria é TRILHA, não campo de formulário. Vindo do corpo, qualquer chamada direta à rota    │
   * │ poderia assinar a confirmação com o id de outra pessoa, e a única pergunta que importa no dia │
   * │ em que uma linha estiver errada ("quem confirmou isto?") passaria a ter resposta inventável.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O CÓDIGO É CONFERIDO CONTRA O CATÁLOGO ANTES DE GRAVAR, e a recusa é 400 com frase útil: sem
   * isso, o erro só apareceria depois, na FK de `vagas.cod_cliente`, no meio da liberação de outra
   * pessoa. Esta tabela não tem FK de propósito (ver o schema), então a conferência é de CÓDIGO.
   *
   * CONFIRMAR NÃO RELIGA A LINHA, e a separação é deliberada: `ativo` é a decisão de confiar na
   * tradução, e confirmar é a decisão sobre QUAL cliente é. Juntar as duas faria uma confirmação
   * desfazer um desligamento sem ninguém pedir.
   */
  async confirmar(id: number, codCliente: string, user: AuthUser): Promise<ItemDoDeParaDeCliente> {
    const codigo = (codCliente ?? "").trim();
    if (codigo === "") {
      throw new BadRequestException("Escolha o cliente do cadastro antes de confirmar a tradução.");
    }
    await this.exigirClienteExistente(codigo);
    const linhas = (await this.db.execute(sql`
      update as_depara_cliente_vaga
         set cod_cliente = ${codigo},
             confirmado_em = now(),
             confirmado_por_id = ${user.id}::uuid,
             atualizado_em = now()
       where id = ${id} and fonte = ${FONTE_DO_DEPARA_DE_CLIENTE}
       returning id
    `)) as unknown as { id: number }[];
    if (linhas.length === 0) throw new NotFoundException("Tradução não encontrada.");
    return this.devolverUm(id);
  }

  /**
   * LIGAR E DESLIGAR A TRADUÇÃO, que é o gesto de "pare de confiar nisto" (e o de volta).
   *
   * DESLIGAR NÃO APAGA, e é por isso que a coluna existe: apagada, a próxima sincronização recria a
   * linha com o palpite da fábrica, e a decisão de desligar seria desfeita de 30 em 30 minutos.
   */
  async alternarAtivo(id: number, ativo: boolean): Promise<ItemDoDeParaDeCliente> {
    /*
     * O `is distinct from` evita a escrita inútil de quem clica duas vezes, e por isso ele NÃO é o
     * teste de existência: quem responde "esta linha existe?" é o `devolverUm`, que é quem levanta
     * o 404. Juntar as duas coisas faria o segundo clique devolver "não encontrada".
     */
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set ativo = ${ativo}, atualizado_em = now()
       where id = ${id} and fonte = ${FONTE_DO_DEPARA_DE_CLIENTE} and ativo is distinct from ${ativo}
    `);
    return this.devolverUm(id);
  }

  // ── A SINCRONIZAÇÃO ──────────────────────────────────────────────────────────────────────────

  /**
   * A PLANILHA VIVA VIRANDO CATÁLOGO, e ela é IDEMPOTENTE: rodar duas vezes sobre a mesma planilha
   * não cria linha, não desfaz confirmação e não escreve de novo o que não mudou.
   *
   * ┌─ A AMBIGUIDADE DESLIGA A LINHA, E NÃO ESCOLHE UM CLIENTE ──────────────────────────────────┐
   * │ Mesmo código com dois clientes NÃO RESOLVE, nunca "o último vence". E se já havia linha para  │
   * │ aquele código, ela é DESLIGADA: a planilha passou a se contradizer, e continuar propondo a    │
   * │ resposta antiga seria afirmar na tela algo que a fonte já não afirma. Religar é gesto humano. │
   * │                                                                                              │
   * │ O ZERO DE HOJE NÃO AUTORIZA SUPOR, e isso foi provado nesta frente: apareceu uma linha nova   │
   * │ entre a cópia da manhã e a leitura da tarde. A planilha é editada DURANTE O DIA.              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async sincronizar(): Promise<ResumoDaSincronizacaoDoDePara> {
    const resumo = this.resumoVazio();
    if (!this.planilha.estaAtiva()) {
      resumo.falha = "DEFINITIVA";
      this.logger.log(
        `De/para de cliente INERTE: ${VARIAVEL_DO_ARQUIVO_DA_PLANILHA} não configurada. Nada foi lido.`,
      );
      return resumo;
    }

    let lida;
    try {
      lida = await this.planilha.ler();
    } catch (err) {
      /*
       * NADA FOI ESCRITO, E NADA FOI APAGADO. A família sobe no resumo para quem opera saber se vale
       * retentar; a MENSAGEM vai para o log porque ela é texto padrão sobre coluna e status, nunca
       * conteúdo de célula (§A.6).
       */
      resumo.falha = err instanceof FalhaDaPlanilhaViva ? err.familia : "INALCANCAVEL";
      this.logger.error(
        `De/para de cliente: a leitura da planilha falhou (${resumo.falha}). ` +
          `Nenhuma tradução foi criada, alterada ou desligada. ` +
          `${err instanceof Error ? err.message : ""}`,
      );
      return resumo;
    }

    resumo.linhasLidas = lida.totalLinhas;
    /*
     * ─ O STATUS DA VAGA, AGREGADO POR CÓDIGO (F2, 06/10/2026) ──────────────────────────────────
     *
     * A planilha tem uma linha por CANDIDATO, então o "Status" da vaga se repete nas várias linhas
     * dela. `agregarStatusDaPlanilha` reduz cada código a um token canônico de vocabulário fechado.
     *
     * NO CONFLITO, A ABERTA GANHA DA FECHADA (decisão do diretor, 07/10/2026): basta UMA linha
     * ABERTO/ENTREGUE para o código ser ABERTO (ou ENTREGUE, quando não há ABERTO). *(Este bloco
     * dizia o inverso, "fail-closed no conflito: se qualquer linha não entra, a vaga não entra", que
     * era a régua anterior e fazia vaga aberta SUMIR.)* O fundamento é que a operação reaproveitava
     * código de vaga no passado, então código misto é código reusado: uma vaga fechou e outra está
     * aberta, e havendo linha aberta há trabalho a fazer.
     *
     * A chave é NORMALIZADA pela mesma `normalizarCodigoDeVaga` do mapa, para casar com
     * `codigo_externo`. §A.6: status é ciclo de vida, não dado pessoal; o token canônico é o que a
     * régua usa, nunca o texto cru.
     */
    const brutosPorCodigo = new Map<string, unknown[]>();
    for (const l of lida.linhas) {
      const chave = normalizarCodigoDeVaga(l.codigo);
      if (chave === null) continue;
      const atual = brutosPorCodigo.get(chave);
      if (atual) atual.push(l.status);
      else brutosPorCodigo.set(chave, [l.status]);
    }
    const statusPorCodigo = new Map<string, StatusDePlanilhaCanonico | null>();
    for (const [chave, brutos] of brutosPorCodigo) {
      statusPorCodigo.set(chave, agregarStatusDaPlanilha(brutos));
    }
    /*
     * AS LINHAS ENTRAM NO DOMÍNIO SEM PALPITE NENHUM (`codCliente: null`, `confirmado: false`): o
     * papel do `montarMapaDePara` aqui é DESDOBRAR as 3.532 linhas em uma por código e separar o que
     * é chave, o que é família interna, o que é malformado, o que é vazio e o que é ambíguo. O
     * palpite vem depois, por NOME, que é a única chave possível (o CNPJ da planilha está vazio em
     * 26.230 de 26.231 células, medido no XML, não pelo leitor).
     */
    const cruas: LinhaDoDeParaDeCliente[] = lida.linhas.map((l) => ({
      codigo: l.codigo,
      nomeCliente: l.cliente,
      codCliente: null,
      confirmado: false,
    }));
    const { mapa, resumo: resumoDoMapa } = montarMapaDePara(cruas, { clientesDoCatalogo: [] });
    resumo.malformados = resumoDoMapa.malformados;
    resumo.codigosInternos = resumoDoMapa.codigosInternos;
    resumo.vazios = resumoDoMapa.vazios;
    resumo.ambiguos = resumoDoMapa.ambiguos;
    resumo.chaves = resumoDoMapa.chaves;

    /*
     * ─ O PRÉ-PREENCHIMENTO, AGREGADO POR CÓDIGO (07/10/2026) ────────────────────────────────────
     *
     * MESMO MOLDE DO STATUS, e pela mesma razão: a planilha tem uma linha por CANDIDATO, então os
     * atributos da VAGA se repetem nas várias linhas dela. A diferença é a REGRA DE CONFLITO, e ela
     * é deliberadamente outra: o status escolhe um token no conflito (a aberta ganha da fechada,
     * porque vaga aberta não pode sumir da fila), e o pré-preenchimento SE ABSTÉM, POR CAMPO,
     * porque aqui não há nada a perder por ficar vazio e há muito a perder por preencher errado.
     *
     * OS CATÁLOGOS ENTRAM POR ARGUMENTO, e o domínio é puro: é ele que decide o que casa, o que é
     * ambíguo e o que se abstém, com teste próprio e sem banco. Esta classe só lê, agrega e grava.
     */
    const catalogosDoPrePreenchimento = await this.catalogosDoPrePreenchimento();
    const prePreenchimentoPorCodigo = agregarPrePreenchimentoPorCodigo(
      lida.linhas,
      catalogosDoPrePreenchimento,
    );
    for (const item of prePreenchimentoPorCodigo.values()) {
      if (temAlgoAPrePreencher(item.valores)) resumo.prePreenchimentosComValor += 1;
      for (const campo of CAMPOS_DO_PRE_PREENCHIMENTO) {
        if (item.veredictos[campo] === "AMBIGUO_NA_PLANILHA") {
          resumo.prePreenchimentosAmbiguosPorCampo += 1;
        }
      }
    }

    const catalogo = await this.catalogoDeClientes();
    const existentes = await this.linhasExistentes();

    for (const [codigoExterno, entrada] of mapa) {
      if (entrada.ambigua) {
        const atual = existentes.get(codigoExterno);
        if (atual !== undefined && atual.ativo) {
          await this.desligarPorAmbiguidade(atual.id);
          resumo.linhasDesligadasPorAmbiguidade += 1;
        }
        continue;
      }
      const palpite = proporCasamentoDeCliente(entrada.nomeCliente, catalogo);
      if (palpite.tipo === "EXATO") resumo.palpitesExatos += 1;
      else if (palpite.tipo === "PREFIXO") resumo.palpitesPorPrefixo += 1;
      else resumo.semPalpite += 1;
      const codigoDoPalpite = "codCliente" in palpite ? palpite.codCliente : null;

      const atual = existentes.get(codigoExterno);
      if (atual === undefined) {
        await this.criar(
          codigoExterno,
          entrada.nomeCliente,
          codigoDoPalpite,
          palpite.tipo,
          statusPorCodigo.get(codigoExterno) ?? null,
          prePreenchimentoPorCodigo.get(codigoExterno)?.valores ?? null,
        );
        resumo.linhasCriadas += 1;
        continue;
      }
      /*
       * O NOME MUDOU NA PLANILHA: a confirmação CAI, porque ela era sobre OUTRO cliente. Manter o
       * carimbo aqui faria a tela afirmar que uma pessoa confirmou um vínculo que ela nunca viu, e o
       * de/para passaria a resolver o cliente antigo para a vaga que mudou de dono.
       */
      const trocouONome =
        nomeComparavelDeCliente(atual.nomeCliente) !==
        nomeComparavelDeCliente(entrada.nomeCliente);
      if (trocouONome) {
        if (atual.confirmado) resumo.confirmacoesDesfeitasPorTrocaDeNome += 1;
        await this.reabrirCuradoria(atual.id, entrada.nomeCliente, codigoDoPalpite, palpite.tipo);
        resumo.linhasAtualizadas += 1;
        continue;
      }
      /*
       * LINHA CONFIRMADA NÃO É TOCADA, e o palpite da fábrica não discute com ela. Só o que ainda
       * está PENDENTE é atualizado, e só quando o palpite de fato mudou (catálogo novo, cliente
       * cadastrado depois): assim a passada em regime estável não escreve nada.
       */
      if (atual.confirmado) continue;
      if (atual.codCliente === codigoDoPalpite && atual.casamento === palpite.tipo) continue;
      await this.atualizarPalpite(atual.id, codigoDoPalpite, palpite.tipo);
      resumo.linhasAtualizadas += 1;
    }

    /*
     * ─ SEGUNDA PASSADA: O STATUS DA VAGA, FRESCO E INDEPENDENTE DA CURADORIA DE CLIENTE (F2) ─────
     *
     * O status é atributo da VAGA, ORTOGONAL ao vínculo de cliente: ele precisa ficar fresco até em
     * linha CONFIRMADA (a confirmação é sobre o cliente, não sobre o status). Por isso ele é escrito
     * à parte, e não no caminho do palpite: a linha nova já nasceu com o status no INSERT (`criar`),
     * então ela não entra aqui; as existentes são atualizadas só quando o status MUDOU de fato, pelo
     * `is distinct from` em JS, para a passada estável continuar MUDA. A linha AMBÍGUA é pulada: ela
     * é desligada pelo cliente contraditório, e tocá-la aqui poluiria a instrução única que a mede.
     */
    for (const [codigoExterno, statusNovo] of statusPorCodigo) {
      if (mapa.get(codigoExterno)?.ambigua) continue;
      const atual = existentes.get(codigoExterno);
      if (atual === undefined) continue;
      if (atual.statusPlanilha === statusNovo) continue;
      await this.atualizarStatusDaPlanilha(atual.id, statusNovo);
    }

    /*
     * ─ TERCEIRA PASSADA: O PRÉ-PREENCHIMENTO, NO MOLDE EXATO DA SEGUNDA ──────────────────────────
     *
     * As cinco colunas são atributo da VAGA, ORTOGONAIS ao vínculo de cliente: elas precisam ficar
     * frescas até em linha CONFIRMADA (a confirmação é sobre o CLIENTE, e não sobre o cargo nem
     * sobre a data de abertura). Por isso são escritas à parte, e não no caminho do palpite.
     *
     * A LINHA NOVA JÁ NASCEU COM OS VALORES NO INSERT (`criar`), então ela não entra aqui; as
     * EXISTENTES são atualizadas SÓ QUANDO ALGO MUDOU DE FATO, pelo `is distinct from` EM JS, para
     * a passada estável continuar MUDA. É o que faz 263 códigos com a mesma planilha de ontem
     * produzirem ZERO instrução de escrita, de 30 em 30 minutos.
     *
     * A LINHA AMBÍGUA É PULADA, pelo mesmo motivo da segunda passada: ela é desligada pelo cliente
     * contraditório, e tocá-la aqui poluiria a instrução única que a mede. Note que esta é a
     * ambiguidade de CLIENTE, outra coisa da ambiguidade POR CAMPO do pré-preenchimento (que já se
     * resolveu em nulo dentro do domínio, campo por campo).
     */
    for (const [codigoExterno, item] of prePreenchimentoPorCodigo) {
      if (mapa.get(codigoExterno)?.ambigua) continue;
      const atual = existentes.get(codigoExterno);
      if (atual === undefined) continue;
      if (!this.prePreenchimentoMudou(atual.prePreenchimento, item.valores)) continue;
      await this.atualizarPrePreenchimento(atual.id, item.valores);
    }

    this.logger.log(
      `De/para de cliente: ${resumo.linhasLidas} linha(s) lida(s), ${resumo.chaves} chave(s), ` +
        `${resumo.linhasCriadas} criada(s), ${resumo.linhasAtualizadas} atualizada(s), ` +
        `${resumo.palpitesExatos} palpite(s) exato(s), ${resumo.palpitesPorPrefixo} por prefixo, ` +
        `${resumo.semPalpite} sem palpite, ${resumo.ambiguos} ambigua(s) ` +
        `(${resumo.linhasDesligadasPorAmbiguidade} desligada(s)), ` +
        `${resumo.confirmacoesDesfeitasPorTrocaDeNome} confirmacao(oes) reaberta(s), ` +
        `${resumo.malformados} malformada(s), ${resumo.codigosInternos} do EA, ${resumo.vazios} vazia(s), ` +
        `${resumo.prePreenchimentosComValor} com pre-preenchimento ` +
        `(${resumo.prePreenchimentosAmbiguosPorCampo} campo(s) ambiguo(s), abstidos).`,
    );
    return resumo;
  }

  // ── O BANCO ──────────────────────────────────────────────────────────────────────────────────

  /**
   * O CATÁLOGO DO EA, com DUAS entradas por cliente quando ele tem nome de operação.
   *
   * ISSO NÃO AFROUXA NADA, e a razão está medida no schema de `vagas.cod_cliente`: a base do time usa
   * NOME COMERCIAL contra RAZÃO SOCIAL, que é a causa de só 31 de 164 clientes terem casado. Duas
   * entradas do MESMO código não criam ambiguidade, porque a ambiguidade é contada por CÓDIGO
   * DISTINTO, nunca por entrada.
   */
  private async catalogoDeClientes(): Promise<ClienteDoCatalogo[]> {
    const linhas = (await this.db.execute(sql`
      select cod_cliente, razao_social, nome_operacao from clientes
    `)) as unknown as {
      cod_cliente: string;
      razao_social: string | null;
      nome_operacao: string | null;
    }[];
    const entradas: ClienteDoCatalogo[] = [];
    for (const l of linhas) {
      for (const nome of [l.razao_social, l.nome_operacao]) {
        if (nome !== null && nome.trim() !== "") {
          entradas.push({ codCliente: l.cod_cliente, razaoSocial: nome });
        }
      }
    }
    return entradas;
  }

  /**
   * OS DOIS CATÁLOGOS DO PRÉ-PREENCHIMENTO, lidos de uma vez e passados ao domínio puro.
   *
   * O CARGO VEM COM `ativo`, E A COLUNA É LIDA, NÃO FILTRADA NO `where`. A ordem das duas coisas é
   * a regra, e ela está escrita no domínio: o cargo INATIVO participa da contagem de ambiguidade
   * (tirá-lo no `where` faria um par colidente virar casamento único, e o módulo passaria a propor
   * um cargo que o catálogo esconde) e, vencendo, o resultado é ABSTENÇÃO. Filtrar aqui inverteria
   * as duas, em silêncio, e o teste do domínio não pegaria porque o filtro estaria no SQL.
   *
   * A LINHA DE SERVIÇO VEM PELO CÓDIGO IMUTÁVEL, nunca pelo rótulo: o rótulo é editável na tela de
   * administração (renomear corrige o nome em toda vaga), e um de/para amarrado nele quebraria no
   * dia em que alguém trocasse "OneShot" por "One Shot".
   */
  private async catalogosDoPrePreenchimento(): Promise<CatalogosDoPrePreenchimento> {
    const cargos = (await this.db.execute(sql`
      select id, nome, ativo from cargos
    `)) as unknown as { id: string; nome: string | null; ativo: boolean }[];
    const linhasServico = (await this.db.execute(sql`
      select id, codigo from as_linhas_servico where ativo = true
    `)) as unknown as { id: number; codigo: string | null }[];
    return {
      cargos: cargos
        .filter((c) => (c.nome ?? "").trim() !== "")
        .map((c) => ({ id: c.id, nome: c.nome as string, ativo: c.ativo === true })),
      linhasServico: linhasServico
        .filter((l) => (l.codigo ?? "").trim() !== "")
        .map((l) => ({ id: l.id, codigo: l.codigo as string })),
    };
  }

  private async linhasExistentes(): Promise<
    Map<
      string,
      {
        id: number;
        nomeCliente: string;
        codCliente: string | null;
        casamento: TipoDeCasamentoDeCliente | null;
        confirmado: boolean;
        ativo: boolean;
        statusPlanilha: StatusDePlanilhaCanonico | null;
        /** O que JÁ está gravado no espelho, para a terceira passada só escrever o que mudou. */
        prePreenchimento: ValoresDoPrePreenchimento;
      }
    >
  > {
    const linhas = (await this.db.execute(sql`
      select id, codigo_externo, nome_cliente, cod_cliente, casamento, status_planilha,
             natureza_planilha, linha_servico_id_planilha, cargo_id_planilha,
             data_abertura_planilha, data_limite_planilha,
             (confirmado_em is not null) as confirmado, ativo
        from as_depara_cliente_vaga
       where fonte = ${FONTE_DO_DEPARA_DE_CLIENTE}
    `)) as unknown as {
      id: number;
      codigo_externo: string;
      nome_cliente: string;
      cod_cliente: string | null;
      casamento: string | null;
      status_planilha: string | null;
      natureza_planilha: string | null;
      linha_servico_id_planilha: number | string | null;
      cargo_id_planilha: string | null;
      data_abertura_planilha: string | Date | null;
      data_limite_planilha: string | Date | null;
      confirmado: boolean;
      ativo: boolean;
    }[];
    return new Map(
      linhas.map((l) => [
        l.codigo_externo,
        {
          id: l.id,
          nomeCliente: l.nome_cliente,
          codCliente: l.cod_cliente,
          casamento: (l.casamento ?? null) as TipoDeCasamentoDeCliente | null,
          confirmado: l.confirmado === true,
          ativo: l.ativo,
          statusPlanilha: (l.status_planilha ?? null) as StatusDePlanilhaCanonico | null,
          prePreenchimento: {
            natureza: (l.natureza_planilha ?? null) as ValoresDoPrePreenchimento["natureza"],
            linhaServicoId:
              l.linha_servico_id_planilha === null || l.linha_servico_id_planilha === undefined
                ? null
                : Number(l.linha_servico_id_planilha),
            cargoId: l.cargo_id_planilha ?? null,
            dataAbertura: DeParaClienteService.dataComparavel(l.data_abertura_planilha),
            dataLimite: DeParaClienteService.dataComparavel(l.data_limite_planilha),
          },
        },
      ]),
    );
  }

  /**
   * A DATA DO BANCO EM `AAAA-MM-DD`, que é a forma em que o domínio a produz.
   *
   * O DRIVER DEVOLVE `date` COMO STRING OU COMO `Date` dependendo da configuração, e comparar as
   * duas formas com a do domínio daria "mudou" em TODA volta: 263 escritas inúteis a cada 30
   * minutos, que é exatamente o defeito que o `is distinct from` existe para impedir. O corte é por
   * `toISOString`, em UTC, sem relógio: `date` não tem hora, então não há fuso a deslocar.
   */
  private static dataComparavel(valor: string | Date | null | undefined): string | null {
    if (valor === null || valor === undefined) return null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    const texto = String(valor).trim();
    return texto === "" ? null : texto.slice(0, 10);
  }

  /** Mudou ALGO nos cinco campos? É o `is distinct from` em JS que mantém a passada estável MUDA. */
  private prePreenchimentoMudou(
    atual: ValoresDoPrePreenchimento,
    novo: ValoresDoPrePreenchimento,
  ): boolean {
    return (
      atual.natureza !== novo.natureza ||
      atual.linhaServicoId !== novo.linhaServicoId ||
      atual.cargoId !== novo.cargoId ||
      atual.dataAbertura !== novo.dataAbertura ||
      atual.dataLimite !== novo.dataLimite
    );
  }

  /** A linha NOVA nasce ATIVA e NÃO CONFIRMADA. Palpite de fábrica nunca nasce confirmado (C1). */
  private async criar(
    codigoExterno: string,
    nomeCliente: string,
    codCliente: string | null,
    casamento: TipoDeCasamentoDeCliente,
    /** O status da vaga na planilha, já canônico (F2). Nulo quando a planilha não disse o status. */
    statusPlanilha: StatusDePlanilhaCanonico | null,
    /**
     * O pré-preenchimento agregado por código (07/10/2026). Nulo é abstenção, por campo.
     *
     * ELE ENTRA NO INSERT, e não só na terceira passada, pelo MESMO motivo do `status_planilha`: a
     * passada que CRIA a linha é a única que sabe que ela é nova, e a terceira passada pula linha
     * inexistente. Sem isso, um código recém-lançado na planilha ficaria sem pré-preenchimento até
     * a volta seguinte, e "chegou na volta seguinte" é um atraso que ninguém investiga.
     */
    prePreenchimento: ValoresDoPrePreenchimento | null,
  ): Promise<void> {
    await this.db.execute(sql`
      insert into as_depara_cliente_vaga
        (fonte, codigo_externo, nome_cliente, cod_cliente, casamento, status_planilha,
         natureza_planilha, linha_servico_id_planilha, cargo_id_planilha,
         data_abertura_planilha, data_limite_planilha)
      values
        (${FONTE_DO_DEPARA_DE_CLIENTE}, ${codigoExterno}, ${nomeCliente}, ${codCliente}, ${casamento}, ${statusPlanilha},
         ${prePreenchimento?.natureza ?? null},
         ${prePreenchimento?.linhaServicoId ?? null}::int,
         ${prePreenchimento?.cargoId ?? null}::uuid,
         ${prePreenchimento?.dataAbertura ?? null}::date,
         ${prePreenchimento?.dataLimite ?? null}::date)
      on conflict (fonte, codigo_externo) do nothing
    `);
  }

  /**
   * O PRÉ-PREENCHIMENTO DE UMA LINHA EXISTENTE, ATUALIZADO SOZINHO, no molde do status.
   *
   * CONDICIONAL EM DOIS LUGARES: o chamador já comparou em JS (`prePreenchimentoMudou`), e a
   * instrução repete a comparação no `where` com `is distinct from`. A redundância é de propósito:
   * a comparação em JS evita a IDA ao banco, e a do `where` é a que vale sob concorrência, se duas
   * voltas se cruzarem.
   *
   * NÃO REABRE CURADORIA, NÃO RELIGA LINHA E NÃO TOCA O VÍNCULO DE CLIENTE: estes cinco campos são
   * atributo da VAGA, e a confirmação humana desta tabela é sobre o CLIENTE. Por isso não há
   * `confirmado_em is null` no `where`: linha confirmada continua recebendo cargo e data frescos.
   */
  private async atualizarPrePreenchimento(
    id: number,
    valores: ValoresDoPrePreenchimento,
  ): Promise<void> {
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set natureza_planilha = ${valores.natureza},
             linha_servico_id_planilha = ${valores.linhaServicoId}::int,
             cargo_id_planilha = ${valores.cargoId}::uuid,
             data_abertura_planilha = ${valores.dataAbertura}::date,
             data_limite_planilha = ${valores.dataLimite}::date,
             atualizado_em = now()
       where id = ${id}
         and (natureza_planilha, linha_servico_id_planilha, cargo_id_planilha,
              data_abertura_planilha, data_limite_planilha)
             is distinct from (${valores.natureza}, ${valores.linhaServicoId}::int, ${valores.cargoId}::uuid,
                               ${valores.dataAbertura}::date, ${valores.dataLimite}::date)
    `);
  }

  /**
   * O STATUS DA VAGA, ATUALIZADO SOZINHO (F2), independente da curadoria de cliente.
   *
   * Condicional (`is distinct from`) para a passada estável não escrever: o status é ciclo de vida da
   * VAGA, então ele muda por conta própria e NÃO reabre curadoria, NÃO religa linha e NÃO toca o
   * vínculo de cliente. §A.6: grava token canônico, nunca texto cru da planilha.
   */
  private async atualizarStatusDaPlanilha(
    id: number,
    statusPlanilha: StatusDePlanilhaCanonico | null,
  ): Promise<void> {
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set status_planilha = ${statusPlanilha}, atualizado_em = now()
       where id = ${id} and status_planilha is distinct from ${statusPlanilha}
    `);
  }

  /** O palpite da fábrica, atualizado SÓ em linha pendente. Nunca mexe em `ativo` nem na confirmação. */
  private async atualizarPalpite(
    id: number,
    codCliente: string | null,
    casamento: TipoDeCasamentoDeCliente,
  ): Promise<void> {
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set cod_cliente = ${codCliente}, casamento = ${casamento}, atualizado_em = now()
       where id = ${id} and confirmado_em is null
    `);
  }

  /** O nome mudou na planilha: nome novo, palpite novo, confirmação ZERADA (ver o laço). */
  private async reabrirCuradoria(
    id: number,
    nomeCliente: string,
    codCliente: string | null,
    casamento: TipoDeCasamentoDeCliente,
  ): Promise<void> {
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set nome_cliente = ${nomeCliente},
             cod_cliente = ${codCliente},
             casamento = ${casamento},
             confirmado_em = null,
             confirmado_por_id = null,
             atualizado_em = now()
       where id = ${id}
    `);
  }

  /** O ÚNICO desligamento automático que existe, e ele não religa nada depois (ver o laço). */
  private async desligarPorAmbiguidade(id: number): Promise<void> {
    await this.db.execute(sql`
      update as_depara_cliente_vaga
         set ativo = false, casamento = 'AMBIGUO', atualizado_em = now()
       where id = ${id} and ativo = true
    `);
  }

  private async exigirClienteExistente(codCliente: string): Promise<void> {
    const linhas = (await this.db.execute(sql`
      select cod_cliente from clientes where cod_cliente = ${codCliente} limit 1
    `)) as unknown as { cod_cliente: string }[];
    if (linhas.length === 0) {
      throw new BadRequestException(
        "Este cliente não está no cadastro. Recarregue a página e escolha um cliente da lista.",
      );
    }
  }

  private async devolverUm(id: number): Promise<ItemDoDeParaDeCliente> {
    const linhas = (await this.db.execute(sql`
      select d.id,
             d.codigo_externo,
             d.nome_cliente,
             d.cod_cliente,
             d.casamento,
             d.confirmado_em,
             d.ativo,
             coalesce(c.nome_operacao, c.razao_social) as cliente_do_catalogo
        from as_depara_cliente_vaga d
        left join clientes c on c.cod_cliente = d.cod_cliente
       where d.id = ${id} and d.fonte = ${FONTE_DO_DEPARA_DE_CLIENTE}
       limit 1
    `)) as unknown as {
      id: number;
      codigo_externo: string;
      nome_cliente: string;
      cod_cliente: string | null;
      casamento: string | null;
      confirmado_em: Date | string | null;
      ativo: boolean;
      cliente_do_catalogo: string | null;
    }[];
    const l = linhas[0];
    if (!l) throw new NotFoundException("Tradução não encontrada.");
    return {
      id: l.id,
      codigoExterno: l.codigo_externo,
      nomeCliente: l.nome_cliente,
      codCliente: l.cod_cliente,
      clienteDoCatalogo: l.cliente_do_catalogo,
      casamento: (l.casamento ?? null) as TipoDeCasamentoDeCliente | null,
      confirmado: l.confirmado_em !== null,
      confirmadoEm: l.confirmado_em === null ? null : new Date(l.confirmado_em).toISOString(),
      ativo: l.ativo,
    };
  }

  private resumoVazio(): ResumoDaSincronizacaoDoDePara {
    return {
      linhasLidas: 0,
      chaves: 0,
      linhasCriadas: 0,
      linhasAtualizadas: 0,
      linhasDesligadasPorAmbiguidade: 0,
      confirmacoesDesfeitasPorTrocaDeNome: 0,
      malformados: 0,
      codigosInternos: 0,
      vazios: 0,
      ambiguos: 0,
      palpitesExatos: 0,
      palpitesPorPrefixo: 0,
      semPalpite: 0,
      prePreenchimentosComValor: 0,
      prePreenchimentosAmbiguosPorCampo: 0,
    };
  }
}
