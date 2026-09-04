import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { clienteLojas, clientes } from "../../db/schema";
import { nomeLojaNormalizado } from "../../domain/loja";
import { AiClientService } from "../../ai/ai-client.service";
import type { CreateLojaDto, UpdateLojaDto } from "./lojas.dto";
import {
  aplicarMapeamento,
  amostraParaIa,
  ehXlsx,
  lerCsvLojas,
  lerXlsxLojas,
  MAX_LINHAS_PLANILHA,
  type GradePlanilha,
  type LinhaLoja,
  type MapeamentoColunas,
} from "./lojas-planilha";

/**
 * Catálogo de LOJAS por cliente (cenário 1, `docs/DESENHO-LOJAS-UNIDADES.md`, etapa 1).
 *
 * MESMO PADRÃO dos demais cadastros (clínicas, escalas, cargos, motivos de declínio): INATIVAR É
 * EXCLUSÃO LÓGICA (`ativo=false`), nunca física e nunca em cascata. A loja já escolhida numa admissão
 * continua valendo e o histórico permanece legível; o que muda é que ela sai das opções
 * selecionáveis daqui para frente. Reversível pela reativação.
 *
 * O QUE ELE SUBSTITUI: o nome da loja era escrito no campo CENTRO DE CUSTO, em texto livre, porque
 * não havia onde cadastrar. Seis clientes produziram 170 nomes distintos assim, dos quais 11 são a
 * mesma loja escrita de outro jeito.
 *
 * A COLISÃO DE NOME É DETECTADA PELA MESMA NORMALIZAÇÃO DO BANCO (`nomeLojaNormalizado`), e não por
 * comparação crua. Sem isso o serviço aceitaria "LOJA CENTRO " achando que é nome novo e tomaria um
 * 500 do índice único; com isso, devolve 409 com mensagem que explica o que fazer.
 *
 * §A.6: nome de loja e endereço de estabelecimento. Nenhum dado pessoal.
 */
@Injectable()
export class LojasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
  ) {}

  /**
   * Lista as lojas de UM cliente, ativas e inativas: a tela de administração filtra. Os seletores da
   * operação (liberação, wizard) usam a rota de ativas.
   */
  list(codCliente: string) {
    return this.db
      .select()
      .from(clienteLojas)
      .where(eq(clienteLojas.codCliente, codCliente))
      .orderBy(asc(clienteLojas.nome));
  }

  /**
   * O CATÁLOGO GLOBAL DE LOJAS ATIVAS, de TODOS os clientes, para o filtro de Loja da Esteira e do
   * Gerenciador.
   *
   * POR QUE ELE EXISTE, se já há `listAtivas` por cliente: as duas telas filtram por loja SEM ter um
   * cliente escolhido (o filtro de cliente é opcional e múltiplo), então não há `codCliente` para
   * pendurar a rota nested. Buscar loja a loja, um cliente por vez, seria uma chamada por cliente da
   * base só para montar um seletor.
   *
   * O CATÁLOGO E NÃO OS ITENS DA TELA, pelo mesmo motivo já registrado no filtro de projeto: derivar
   * as opções da página carregada encolheria a lista assim que a primeira loja fosse escolhida, e não
   * haveria como somar a segunda sem limpar o filtro.
   *
   * VEM O NOME DO CLIENTE JUNTO porque nome de loja só é único DENTRO do cliente: o índice do banco é
   * `(cod_cliente, nome normalizado)`. Duas lojas "Loja Centro" de clientes diferentes são legítimas,
   * e sem o cliente ao lado a pessoa escolheria no escuro.
   *
   * §A.6: nome de loja e de cliente. Nenhum dado pessoal.
   */
  listarTodasAtivas() {
    return this.db
      .select({
        id: clienteLojas.id,
        nome: clienteLojas.nome,
        codCliente: clienteLojas.codCliente,
        clienteNome: sql<string>`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})`,
      })
      .from(clienteLojas)
      .innerJoin(clientes, eq(clientes.codCliente, clienteLojas.codCliente))
      .where(eq(clienteLojas.ativo, true))
      .orderBy(asc(clienteLojas.nome));
  }

  /** Só as ATIVAS: é o que alimenta seletor de tela. Loja inativa não vira opção nova. */
  listAtivas(codCliente: string) {
    return this.db
      .select()
      .from(clienteLojas)
      .where(and(eq(clienteLojas.codCliente, codCliente), eq(clienteLojas.ativo, true)))
      .orderBy(asc(clienteLojas.nome));
  }

  async create(codCliente: string, dto: CreateLojaDto) {
    await this.exigirCliente(codCliente);
    const nome = dto.nome.trim();
    const existente = await this.acharPorNome(codCliente, nome);
    // Colidir com uma loja INATIVA não é erro de digitação, é tentativa de recriar algo que já
    // existe: o certo é reativar, e a mensagem diz isso em vez de deixar a pessoa adivinhando.
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Este cliente já tem uma loja com esse nome."
          : "Este cliente já tem uma loja INATIVA com esse nome. Reative em vez de criar outra.",
      );
    }
    const [row] = await this.db
      .insert(clienteLojas)
      .values({
        codCliente,
        nome,
        endereco: dto.endereco?.trim() || null,
        codigoExterno: dto.codigoExterno?.trim() || null,
      })
      .returning();
    return row;
  }

  async update(codCliente: string, id: string, dto: UpdateLojaDto) {
    const nome = dto.nome?.trim();
    if (nome !== undefined) {
      const existente = await this.acharPorNome(codCliente, nome, id);
      // Antecipa o índice único com 409 claro, em vez de deixar vazar um 500 do banco.
      if (existente) throw new ConflictException("Este cliente já tem uma loja com esse nome.");
    }
    const [row] = await this.db
      .update(clienteLojas)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        // String vazia LIMPA o campo (vira null); ausente não toca.
        ...(dto.endereco !== undefined ? { endereco: dto.endereco.trim() || null } : {}),
        ...(dto.codigoExterno !== undefined
          ? { codigoExterno: dto.codigoExterno.trim() || null }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        atualizadoEm: new Date(),
      })
      .where(and(eq(clienteLojas.id, id), eq(clienteLojas.codCliente, codCliente)))
      .returning();
    if (!row) throw new NotFoundException("Loja não encontrada neste cliente");
    return row;
  }

  /** INATIVA (exclusão lógica). Preserva o vínculo das admissões que já usam a loja. */
  async inativar(codCliente: string, id: string) {
    return this.definirAtivo(codCliente, id, false);
  }

  /** Reativa a loja (volta às opções selecionáveis da liberação e do wizard). */
  async reativar(codCliente: string, id: string) {
    return this.definirAtivo(codCliente, id, true);
  }

  private async definirAtivo(codCliente: string, id: string, ativo: boolean) {
    const [row] = await this.db
      .update(clienteLojas)
      .set({ ativo, atualizadoEm: new Date() })
      .where(and(eq(clienteLojas.id, id), eq(clienteLojas.codCliente, codCliente)))
      .returning({ id: clienteLojas.id });
    if (!row) throw new NotFoundException("Loja não encontrada neste cliente");
    return { ok: true, ativo };
  }

  /**
   * Acha a loja pelo nome NORMALIZADO do jeito que o índice único normaliza. `ignorarId` existe para
   * a edição não colidir consigo mesma.
   */
  private async acharPorNome(codCliente: string, nome: string, ignorarId?: string) {
    const alvo = nomeLojaNormalizado(nome);
    const [row] = await this.db
      .select()
      .from(clienteLojas)
      .where(
        and(
          eq(clienteLojas.codCliente, codCliente),
          sql`upper(btrim(regexp_replace(${clienteLojas.nome}, '\\s+', ' ', 'g'))) = ${alvo}`,
          ...(ignorarId ? [ne(clienteLojas.id, ignorarId)] : []),
        ),
      )
      .limit(1);
    return row;
  }

  /** 404 claro quando o código de cliente não existe, em vez de um 500 da chave estrangeira. */
  private async exigirCliente(codCliente: string) {
    const cliente = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, codCliente),
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");
    return cliente;
  }

  // ── IMPORTAÇÃO POR PLANILHA (cenário 1, etapa 2) ───────────────────────────

  /**
   * PRÉVIA: lê a planilha, descobre o mapeamento de colunas e diz o que vai acontecer, SEM GRAVAR.
   *
   * DUAS ETAPAS, e a primeira não escreve, pelo mesmo motivo da importação de matrículas:
   * "importação que grava direto é importação que ninguém confere, e o estrago aparece depois".
   *
   * O MAPEAMENTO vem da IA na primeira chamada e do CONSULTOR nas seguintes. Quando o chamador manda
   * `mapa`, a IA NÃO é consultada: é o caminho da correção, e recalcular sem custo é o que permite ao
   * consultor mexer numa coluna e ver o resultado na hora.
   *
   * A IA NUNCA É CAMINHO ÚNICO. Ela fora, com quota estourada ou devolvendo coluna nenhuma, a prévia
   * volta com o mapeamento vazio e um aviso: o consultor escolhe as colunas na mão e segue.
   *
   * §A.6: o arquivo vive em memória, não passa pela staging e nada do conteúdo é logado.
   */
  async previaImportacao(codCliente: string, arquivo: Buffer, mapa?: MapeamentoColunas) {
    await this.exigirCliente(codCliente);

    const grade: GradePlanilha = ehXlsx(arquivo)
      ? await lerXlsxLojas(arquivo)
      : lerCsvLojas(arquivo.toString("utf8"));

    if (grade.cabecalho.length === 0) {
      throw new BadRequestException("A planilha está vazia ou não tem cabeçalho.");
    }

    // Mapeamento: o que veio do consultor manda; sem ele, pergunta à IA.
    let origemMapeamento: "IA" | "MANUAL" | "NENHUM" = "MANUAL";
    let confianca: string | null = null;
    let observacao: string | null = null;
    let mapeamento: MapeamentoColunas = mapa ?? {
      colunaNome: null,
      colunaEndereco: null,
      colunaCodigo: null,
    };

    if (!mapa) {
      const daIa = await this.ai.mapearColunasPlanilha(grade.cabecalho, amostraParaIa(grade));
      if (daIa && daIa.colunaNome !== null) {
        mapeamento = {
          colunaNome: daIa.colunaNome,
          colunaEndereco: daIa.colunaEndereco,
          colunaCodigo: daIa.colunaCodigo,
        };
        origemMapeamento = "IA";
        confianca = daIa.confianca;
        observacao = daIa.observacao;
      } else {
        // Sem IA, ou IA sem achar a coluna do nome: o modal abre vazio e o consultor escolhe.
        origemMapeamento = "NENHUM";
      }
    }

    const { linhas, rejeitadas, colapsadas } = aplicarMapeamento(grade, mapeamento);

    // Confronta com o catálogo do cliente: o que já existe NÃO duplica.
    const existentes = await this.list(codCliente);
    const porNome = new Map(existentes.map((l) => [nomeLojaNormalizado(l.nome), l]));

    const criar: LinhaLoja[] = [];
    const jaExiste: { linha: number; nome: string; ativo: boolean; ganhaEndereco: boolean }[] = [];
    for (const l of linhas) {
      const atual = porNome.get(nomeLojaNormalizado(l.nome));
      if (!atual) {
        criar.push(l);
        continue;
      }
      // Endereço PREENCHE SÓ O VAZIO e nunca sobrescreve (Q5): quem digitou o endereço na mão sabia
      // mais do que a planilha.
      jaExiste.push({
        linha: l.linha,
        nome: atual.nome,
        ativo: atual.ativo,
        ganhaEndereco: Boolean(l.endereco) && !atual.endereco,
      });
    }

    return {
      colunas: grade.cabecalho,
      mapeamento,
      origemMapeamento,
      confianca,
      observacao,
      totalLinhas: grade.linhas.length,
      descartadasPorTeto: grade.descartadasPorTeto,
      tetoLinhas: MAX_LINHAS_PLANILHA,
      colapsadas,
      criar,
      jaExiste,
      rejeitadas,
    };
  }

  /**
   * APLICA a importação. Grava EXATAMENTE as linhas que a prévia mostrou (Q14, opção A do diretor):
   * o chamador devolve as linhas aprovadas, e não o arquivo. É o que garante que o gravado é o que a
   * pessoa viu na tela, sem uma segunda leitura do arquivo poder divergir da primeira.
   *
   * TRANSACIONAL: ou entra tudo, ou não entra nada.
   */
  async aplicarImportacao(
    codCliente: string,
    // Tipo PRÓPRIO e frouxo de propósito: o corpo vem do cliente, então `endereco` e `codigoExterno`
    // podem chegar ausentes, nulos ou vazios, e o número da linha do arquivo é informativo (serve à
    // tela, não à gravação). Exigir aqui a forma exata da leitura acoplaria o aplicar ao formato do
    // arquivo sem ganho nenhum.
    linhas: Array<{
      nome: string;
      endereco?: string | null;
      codigoExterno?: string | null;
      linha?: number;
    }>,
  ) {
    await this.exigirCliente(codCliente);
    if (linhas.length === 0) return { criadas: 0, enderecosPreenchidos: 0, ignoradas: 0 };
    if (linhas.length > MAX_LINHAS_PLANILHA) {
      throw new BadRequestException(`Máximo de ${MAX_LINHAS_PLANILHA} lojas por importação.`);
    }

    return this.db.transaction(async (tx) => {
      const existentes = await tx
        .select()
        .from(clienteLojas)
        .where(eq(clienteLojas.codCliente, codCliente));
      const porNome = new Map(existentes.map((l) => [nomeLojaNormalizado(l.nome), l]));

      let criadas = 0;
      let enderecosPreenchidos = 0;
      let ignoradas = 0;
      // Colapsa repetido DENTRO do próprio lote também: a prévia já colapsa, mas o corpo vem do
      // cliente e não se confia nele para manter a invariante do índice único.
      const vistos = new Set<string>();

      for (const l of linhas) {
        const nome = l.nome.trim();
        if (!nome) continue;
        const chave = nomeLojaNormalizado(nome);
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        const atual = porNome.get(chave);
        if (atual) {
          // NÃO DUPLICA. Só completa o endereço quando ele está vazio (Q5); nunca sobrescreve, e
          // nunca reativa por importação (reativar é ação explícita da tela).
          if (l.endereco && !atual.endereco) {
            await tx
              .update(clienteLojas)
              .set({ endereco: l.endereco, atualizadoEm: new Date() })
              .where(eq(clienteLojas.id, atual.id));
            enderecosPreenchidos += 1;
          } else {
            ignoradas += 1;
          }
          continue;
        }

        await tx.insert(clienteLojas).values({
          codCliente,
          nome,
          endereco: l.endereco ?? null,
          codigoExterno: l.codigoExterno ?? null,
        });
        criadas += 1;
      }

      return { criadas, enderecosPreenchidos, ignoradas };
    });
  }
}