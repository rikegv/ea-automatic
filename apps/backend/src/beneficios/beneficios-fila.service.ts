import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissaoBeneficio,
  admissoes,
  beneficiosCatalogo,
  candidatos,
  clientes,
  dadosVagaFolha,
} from "../db/schema";

/**
 * BENEFÍCIOS (§A.17 etapa 4): a fila de quem tem benefício a cadastrar.
 *
 * A PERGUNTA DA TELA: "de quem já fechou o Cadastro, quem tem VT, VR, VA e AM?" A esteira conduz a
 * admissão e o Gerenciador lista todas; nenhum dos dois responde o pacote de benefícios por pessoa,
 * que é o que o time precisa ver para lançar nos sistemas de benefício.
 *
 * A FILA É QUEM TEM O CADASTRO CONCLUÍDO, por LEITURA (decisão do diretor, etapa 1). A primeira
 * versão filtrava pelo carimbo `beneficios_entrou_em`, e por isso nascia vazia: o carimbo só existe
 * para quem concluir daqui para frente. Ler a frente traz junto as ~1.610 que já estavam cadastradas,
 * que é o que o diretor precisa ver para entender a dinâmica com dado real.
 *
 * LEITURA E NÃO BACKFILL, e a diferença importa (§A.27). Carimbar as 1.610 seria escrever no banco
 * uma data de entrada que NÃO aconteceu: quem fechou o Cadastro em julho passaria a dizer que entrou
 * na fila hoje, e essa mentira ficaria gravada para sempre. A leitura não escreve nada, não pode
 * corromper dado nenhum e dá exatamente o mesmo resultado na tela. O carimbo continua sendo gravado
 * para as novas, e vale como a data REAL de entrada de quem passou pelo gatilho.
 *
 * A RÉGUA É A QUE JÁ EXISTE: a frente CADASTRO_CONTRATO concluída, a mesma noção de `STATUS_CONCLUI`
 * que o resto do sistema usa. Não é uma régua nova, e por isso não pode divergir de nada.
 *
 * INTEGRAÇÃO NÃO ENTRA NA CONTA daqui de propósito: `admissaoConcluidaSql` exige também a integração
 * fechada, porque lá a pergunta é "o processo terminou?". Aqui a pergunta é "já dá para lançar o
 * benefício?", e isso é verdade assim que o Cadastro fecha, com ou sem integração pela frente.
 *
 * §A.26: LEITURA PURA. Este serviço não tem `insert`, `update` nem `delete`, não toca frente, farol,
 * régua nem KPI de tela nenhuma. Desligar este arquivo não muda uma linha do que a operação faz.
 *
 * §A.6: nome do candidato e código de cliente (é uma tela de gestão que precisa dizer DE QUEM é o
 * benefício), sem CPF, sem contato e sem documento.
 */
@Injectable()
export class BeneficiosFilaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * OS QUATRO PRINCIPAIS, na ordem em que a tela os mostra (decisão do diretor). Cada um vira uma
   * coluna de sim ou não; o resto do catálogo cai no "+N" que expande.
   *
   * O CASAMENTO É PELA SIGLA, o primeiro pedaço do nome do catálogo ("VT (Vale-Transporte)" -> VT),
   * e não por id fixo no código: id de catálogo em constante quebra na primeira base diferente, e o
   * catálogo é VIVO (a tela de Benefícios do admin renomeia e cria). Se alguém renomear a ponto de
   * perder a sigla, o benefício não some da tela: ele cai no "+N", que é a degradação segura.
   */
  private static readonly PRINCIPAIS = ["VT", "VR", "VA", "AM"] as const;

  /**
   * QUANDO ENTROU NA FILA: o carimbo quando existe (as novas, que passaram pelo gatilho) e a
   * conclusão do Cadastro para as retroativas. Declarada UMA vez porque a tela mostra e a ordenação
   * usa: duas cópias divergiriam na primeira edição, e a lista passaria a ser ordenada por um
   * critério diferente do que a coluna exibe.
   */
  private static readonly ENTROU_EM = sql<string | null>`coalesce(
    ${admissoes.beneficiosEntrouEm},
    (select max(f.data_conclusao) from frentes_admissao f
      where f.admissao_id = ${admissoes.id} and f.tipo = 'CADASTRO_CONTRATO' and f.concluida = true)
  )`;

  /**
   * A CONDIÇÃO DA FILA, escrita uma vez: Cadastro concluído e processo não encerrado.
   *
   * §A.16: quem declinou ou rescindiu não deixa trabalho ativo em fila nenhuma. O histórico continua
   * no Gerenciador, que é a visão consultável; aqui é tela de trabalho.
   */
  private static readonly NA_FILA = sql`
    EXISTS (
      SELECT 1 FROM frentes_admissao f
       WHERE f.admissao_id = ${admissoes.id} AND f.tipo = 'CADASTRO_CONTRATO' AND f.concluida = true
    )
    AND ${admissoes.farolGlobal} NOT IN ('DECLINOU', 'RESCISAO')`;

  /**
   * A COLUNA PEDIDA traduzida em expressão SQL, ou `null` quando a chave não está na lista fechada.
   *
   * Os quatro benefícios ordenam pela PRESENÇA (tem primeiro, no primeiro clique), que é a mesma
   * pergunta que a coluna faz na tela. "Outros" ordena pela QUANTIDADE de benefícios fora dos quatro,
   * que é o número que o "+N" mostra: ordenar por outra coisa faria a seta discordar do que está
   * escrito na célula.
   */
  private expressaoDeOrdem(chave: string | undefined, idPorSigla: Map<string, string>): SQL | null {
    if (!chave) return null;
    if (chave === "candidato") return sql`${candidatos.nome}`;
    if (chave === "dataAdmissao") return sql`${admissoes.dataAdmissao}`;
    if (chave === "cliente")
      return sql`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial}, ${admissoes.codCliente})`;
    if (chave === "entrouEm") return BeneficiosFilaService.ENTROU_EM;
    if ((BeneficiosFilaService.PRINCIPAIS as readonly string[]).includes(chave)) {
      const id = idPorSigla.get(chave);
      // Sigla que não existe mais no catálogo (renomeada) não vira ordem inventada: cai no padrão.
      if (!id) return null;
      return sql`EXISTS (${existeBeneficio(id)})`;
    }
    if (chave === "outros") {
      const ids = BeneficiosFilaService.PRINCIPAIS.map((s) => idPorSigla.get(s)).filter(
        (v): v is string => Boolean(v),
      );
      if (!ids.length) return sql`(select count(*) from admissao_beneficio ab
                                    where ab.admissao_id = ${admissoes.id})`;
      return sql`(select count(*) from admissao_beneficio ab
                   where ab.admissao_id = ${admissoes.id}
                     and ab.beneficio_id not in (${sql.join(
                       ids.map((i) => sql`${i}`),
                       sql`, `,
                     )}))`;
    }
    return null;
  }

  /**
   * A fila com busca, filtros e página.
   *
   * A PÁGINA EXISTE PORQUE A FILA CRESCEU: com os retroativos são ~1.600 pessoas, e devolver tudo de
   * uma vez carregaria o pacote de benefício de todas elas a cada abertura de tela.
   */
  async listar(filtros: FiltrosBeneficios = {}) {
    const page = Math.max(1, filtros.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filtros.pageSize ?? 50));

    // O mapa sigla -> id do catálogo, resolvido UMA vez e reusado pelos filtros de benefício. É o que
    // permite filtrar por `beneficio_id` (índice) em vez de por texto do nome.
    const catalogo = await this.db
      .select({ id: beneficiosCatalogo.id, nome: beneficiosCatalogo.nome })
      .from(beneficiosCatalogo);
    const idPorSigla = new Map(catalogo.map((c) => [sigla(c.nome), c.id]));

    const where: SQL[] = [BeneficiosFilaService.NA_FILA];

    if (filtros.q?.trim()) {
      // Busca por NOME do candidato ou por CLIENTE (código, nome de operação ou razão social), que é
      // como o time procura: ou pela pessoa, ou pela operação em que ela entrou.
      const alvo = `%${filtros.q.trim()}%`;
      where.push(
        sql`(${candidatos.nome} ILIKE ${alvo}
          OR ${admissoes.codCliente} ILIKE ${alvo}
          OR ${clientes.nomeOperacao} ILIKE ${alvo}
          OR ${clientes.razaoSocial} ILIKE ${alvo})`,
      );
    }
    if (filtros.codCliente?.length) {
      where.push(inArray(admissoes.codCliente, filtros.codCliente));
    }
    // COM e SEM são filtros separados, e não um seletor de "sim/não" por benefício: assim dá para
    // pedir "tem VT e NÃO tem VR" numa consulta só, que é o recorte que o time usa para achar quem
    // ficou pela metade.
    for (const s of filtros.com ?? []) {
      const id = idPorSigla.get(s);
      if (id) where.push(sql`EXISTS (${existeBeneficio(id)})`);
    }
    for (const s of filtros.sem ?? []) {
      const id = idPorSigla.get(s);
      if (id) where.push(sql`NOT EXISTS (${existeBeneficio(id)})`);
    }
    // PACOTE: separa quem tem benefício estruturado de quem só tem o texto da planilha. É o filtro
    // que responde "quanto da base já está no formato novo", e a diferença é enorme hoje.
    if (filtros.pacote === "ESTRUTURADO") where.push(sql`EXISTS (${existeQualquerBeneficio()})`);
    if (filtros.pacote === "IMPORTADO") where.push(sql`NOT EXISTS (${existeQualquerBeneficio()})`);

    const condicao = and(...where)!;

    /**
     * ORDENAÇÃO NO BANCO, e não na tela (decisão do diretor, leva 2).
     *
     * A fila é PAGINADA no servidor (50 de 1.640), e ordenar no cliente ordenaria só a página
     * aberta: a primeira linha da tela não seria a primeira da fila, e a ordem mostrada seria falsa.
     * Aqui o `order by` entra ANTES do `limit`, então a página 1 é de fato o começo da ordem pedida.
     *
     * LISTA FECHADA de colunas, e não o nome que vier na URL: é o que impede injeção e o que faz uma
     * URL antiga no favorito de alguém cair na ordem padrão em vez de derrubar a tela.
     */
    const colunaOrdenada = this.expressaoDeOrdem(filtros.ordenarPor, idPorSigla);
    const desc_ = (filtros.direcao ?? "desc") === "desc";
    const ordem = colunaOrdenada
      ? [desc_ ? desc(colunaOrdenada) : asc(colunaOrdenada), desc(admissoes.criadoEm)]
      : // Padrão: mais recente primeiro, que é quem o time ainda não lançou.
        [desc(BeneficiosFilaService.ENTROU_EM), desc(admissoes.criadoEm)];

    const [linhas, [contagem], listaClientes] = await Promise.all([
      this.db
        .select({
          admissaoId: admissoes.id,
          candidato: candidatos.nome,
          dataAdmissao: admissoes.dataAdmissao,
          codCliente: admissoes.codCliente,
          clienteRazaoSocial: clientes.razaoSocial,
          clienteNomeOperacao: clientes.nomeOperacao,
          entrouEm: BeneficiosFilaService.ENTROU_EM,
          /**
           * O TEXTO ACHATADO das importadas (`dados_vaga_folha.beneficios`), que é o fallback da
           * linha. A base tem as duas formas: o pacote estruturado das admissões novas e este texto
           * das que vieram da planilha, que nunca tiveram linha no catálogo. É a mesma convivência
           * que a ficha da Integração já resolve assim.
           */
          beneficiosTexto: dadosVagaFolha.beneficios,
        })
        .from(admissoes)
        .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
        .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
        .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
        .where(condicao)
        // `criadoEm` desempata para a ordem nunca dançar entre duas aberturas da mesma página.
        .orderBy(...ordem)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(admissoes)
        .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
        .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
        .where(condicao),
      // OS CLIENTES DO SELETOR saem da fila INTEIRA, não da página nem do recorte filtrado: um filtro
      // que só oferece o que já está selecionado vira uma porta que se fecha sozinha.
      this.db
        .selectDistinct({
          codCliente: admissoes.codCliente,
          nomeOperacao: clientes.nomeOperacao,
          razaoSocial: clientes.razaoSocial,
        })
        .from(admissoes)
        .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
        .where(BeneficiosFilaService.NA_FILA)
        .orderBy(asc(admissoes.codCliente)),
    ]);

    const ids = linhas.map((l) => l.admissaoId);
    const pacotes = ids.length
      ? await this.db
          .select({
            admissaoId: admissaoBeneficio.admissaoId,
            nome: beneficiosCatalogo.nome,
            valor: admissaoBeneficio.valor,
          })
          .from(admissaoBeneficio)
          .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, admissaoBeneficio.beneficioId))
          .where(inArray(admissaoBeneficio.admissaoId, ids))
          .orderBy(asc(beneficiosCatalogo.nome))
      : [];

    const porAdmissao = new Map<string, { nome: string; valor: string | null }[]>();
    for (const p of pacotes) {
      const lista = porAdmissao.get(p.admissaoId) ?? [];
      lista.push({ nome: p.nome, valor: p.valor });
      porAdmissao.set(p.admissaoId, lista);
    }

    const items = linhas.map((l) => {
      const pacote = porAdmissao.get(l.admissaoId) ?? [];
      const siglas = new Set(pacote.map((b) => sigla(b.nome)));
      return {
        admissaoId: l.admissaoId,
        candidato: l.candidato,
        dataAdmissao: l.dataAdmissao,
        codCliente: l.codCliente,
        cliente: l.clienteNomeOperacao || l.clienteRazaoSocial || null,
        entrouEm: l.entrouEm,
        /** As quatro colunas fixas da linha, sempre presentes, sempre na mesma ordem. */
        principais: Object.fromEntries(
          BeneficiosFilaService.PRINCIPAIS.map((s) => [s, siglas.has(s)]),
        ) as Record<(typeof BeneficiosFilaService.PRINCIPAIS)[number], boolean>,
        /**
         * O VALOR de cada um dos quatro, para o modal que abre ao clicar na célula.
         *
         * VEM DA CONSULTA QUE JÁ EXISTE: o pacote já traz `valor` de todo benefício, e até aqui ele
         * era descartado para os principais. Nulo é o estado honesto de quem tem o benefício sem
         * valor cadastrado, e é o caso do VT hoje, que só ganha valor quando o formulário de VT for
         * ligado.
         */
        valores: Object.fromEntries(
          BeneficiosFilaService.PRINCIPAIS.map((s) => [
            s,
            pacote.find((b) => sigla(b.nome) === s)?.valor ?? null,
          ]),
        ) as Record<(typeof BeneficiosFilaService.PRINCIPAIS)[number], string | null>,
        /** Tudo que não é um dos quatro: é o conteúdo do "+N" que expande. */
        outros: pacote
          .filter((b) => !BeneficiosFilaService.PRINCIPAIS.includes(sigla(b.nome) as never))
          .map((b) => ({ nome: b.nome, valor: b.valor })),
        /**
         * IMPORTADA: só quando NÃO há pacote estruturado. A ordem importa, porque o estruturado é o
         * dado bom e o texto é o resto do que a planilha deixou; mostrar os dois faria a linha dizer
         * a mesma coisa duas vezes, de dois jeitos diferentes.
         */
        textoImportado: pacote.length === 0 ? (l.beneficiosTexto ?? null) : null,
      };
    });

    const total = Number(contagem?.n ?? 0);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      /** A tela desenha uma coluna por sigla, na ordem que o serviço manda. */
      principais: [...BeneficiosFilaService.PRINCIPAIS],
      clientes: listaClientes
        .filter((c) => c.codCliente)
        .map((c) => ({
          codCliente: c.codCliente!,
          nome: c.nomeOperacao || c.razaoSocial || c.codCliente!,
        })),
    };
  }
}

export const COLUNAS_ORDENAVEIS = [
  "candidato",
  "dataAdmissao",
  "cliente",
  "entrouEm",
  "VT",
  "VR",
  "VA",
  "AM",
  "outros",
] as const;

export interface FiltrosBeneficios {
  /** Busca por nome do candidato ou por cliente (código, operação ou razão social). */
  q?: string;
  codCliente?: string[];
  /** Siglas que a pessoa TEM (VT, VR, VA, AM). */
  com?: string[];
  /** Siglas que a pessoa NÃO tem. */
  sem?: string[];
  /** ESTRUTURADO = tem pacote no catálogo; IMPORTADO = só tem o texto da planilha. */
  pacote?: "ESTRUTURADO" | "IMPORTADO";
  /** Coluna da ordenação. Fora da lista fechada, cai na ordem padrão. */
  ordenarPor?: string;
  direcao?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

/** Subconsulta de "esta admissão tem ESTE benefício", usada pelos filtros COM e SEM. */
function existeBeneficio(beneficioId: string): SQL {
  return sql`select 1 from admissao_beneficio ab
              where ab.admissao_id = ${admissoes.id} and ab.beneficio_id = ${beneficioId}`;
}

/** Subconsulta de "esta admissão tem pacote estruturado", usada pelo filtro de pacote. */
function existeQualquerBeneficio(): SQL {
  return sql`select 1 from admissao_beneficio ab where ab.admissao_id = ${admissoes.id}`;
}

/**
 * A sigla do benefício: o primeiro pedaço do nome do catálogo, antes do parêntese ou do espaço.
 * "VT (Vale-Transporte)" vira "VT"; "Cesta básica" vira "CESTA", que não casa com nenhuma das quatro
 * e por isso cai no "+N", exatamente como se espera.
 */
function sigla(nome: string): string {
  return (nome.trim().split(/[\s(]/)[0] ?? "").toUpperCase();
}
