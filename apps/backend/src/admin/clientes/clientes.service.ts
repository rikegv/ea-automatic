import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  admissoes,
  asComerciais,
  asSegmentos,
  candidatos,
  clientes,
  clienteVinculos,
  entidadesSoulan,
} from "../../db/schema";
import { segmentoEscolhido } from "../../as/segmentos/segmentos.service";
import { comercialEscolhido } from "../../as/comerciais/comerciais.service";
import type { CreateClienteDto, UpdateClienteDto } from "./clientes.dto";
import { opcaoIdDoVinculo, VINCULO_OPCOES } from "./vinculo-opcoes";
import { ROTULO_TIPO_SERVICO } from "../../domain/vinculo";

/** Faróis de admissão "em andamento" (afetados ao inativar o cliente). Excluídos os terminais. */
const FAROIS_TERMINAIS = ["ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO"] as const;

/** tipo_servico do vínculo → rótulo curto para a tela de clientes. */
const TIPO_SERVICO_ROTULO: Record<string, string> = {
  TEMPORARIO: "Temporário",
  TERCEIRO: "Terceiro",
  ESTAGIO: "Estágio",
  INTERNO: "Interno",
  FOPAG: "FOPAG",
};

/** Vínculo empresa/CNPJ resolvido de um cliente (view `vw_vinculo_empresa_cnpj` + cliente_vinculos). */
interface VinculoLinha {
  cod_cliente: string;
  empresa_codigo: string | null;
  filial: string | null;
  tipo_servico: string | null;
  is_fopag: boolean;
  empresa_resolvida: string | null;
  cnpj_resolvido: string | null;
}

@Injectable()
export class ClientesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lista os clientes JÁ com o vínculo cliente↔empresa Soulan resolvido (empregador + CNPJ + tipo de
   * serviço), para a tela de clientes exibir por cliente. O vínculo vem da view `vw_vinculo_empresa_cnpj`
   * (~1 por cliente); se houver mais de um, prioriza o que tem CNPJ resolvido. §A.6: CNPJ só na resposta,
   * nunca em log.
   */
  async list() {
    const base = await this.db.select().from(clientes).orderBy(clientes.razaoSocial);
    /**
     * ─ O RÓTULO DO SEGMENTO (Onda E), RESOLVIDO POR MAPA E **NÃO** POR JOIN NESTA CONSULTA ──────
     *
     * ┌─ POR QUE O `select()` NU ACIMA NÃO FOI TOCADO (§A.26) ────────────────────────────────────┐
     * │ Acrescentar um `leftJoin` obrigaria a trocar o `select()` sem argumento por um `select({   │
     * │ c: clientes, ... })`, porque com join o drizzle passa a devolver a linha ANINHADA por       │
     * │ tabela. Isso reescreveria a forma de uma consulta que alimenta a tela de Clientes, o wizard │
     * │ e a Liberação, para acrescentar UMA string. Um mapa do catálogo custa uma consulta a uma    │
     * │ tabela de poucas linhas e não encosta na consulta validada.                                │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * ┌─ E ELE RESOLVE O SEGMENTO, **NUNCA** O NOME DO COMERCIAL (§A.6, régua do coordenador) ─────┐
     * │ Esta rota (`GET /admin/clientes`) NÃO tem `@Roles` e NÃO é reivindicada por menu nenhum     │
     * │ (o `menus.ts` deixa o GET de lista de fora de propósito, porque o consultor precisa dele na │
     * │ Liberação e no wizard): ela é alcançável por QUALQUER sessão autenticada. `segmento_id`,    │
     * │ `segmento_rotulo` e `comercial_id` não são dado pessoal e podem sair daqui. O NOME do       │
     * │ comercial NÃO PODE: seria a folha do time comercial vazando pela lista de clientes, que é   │
     * │ exatamente o que a ausência de uma `ComerciaisController` aberta existe para impedir. Quem  │
     * │ mostra o nome é a tela de Clientes, que carrega o catálogo por rota GATADA e casa pelo id.  │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * OS INATIVOS ENTRAM NO MAPA (a consulta não filtra `ativo`): o cliente cadastrado num segmento
     * que saiu de circulação continua dizendo de que ramo ele é, em vez de mostrar vazio. É o
     * precedente da etapa fantasma aplicado à leitura.
     */
    const rotuloDoSegmento = new Map(
      (await this.db.select({ id: asSegmentos.id, rotulo: asSegmentos.rotulo }).from(asSegmentos)).map(
        (s) => [s.id, s.rotulo] as const,
      ),
    );
    const vinc = (await this.db.execute(sql`
      SELECT DISTINCT ON (v.cod_cliente)
        v.cod_cliente, v.empresa_codigo, v.filial, v.tipo_servico, v.is_fopag,
        vw.empresa_resolvida, vw.cnpj_resolvido
      FROM cliente_vinculos v
      JOIN vw_vinculo_empresa_cnpj vw ON vw.cliente_vinculo_id = v.id
      ORDER BY v.cod_cliente, (vw.cnpj_resolvido IS NOT NULL) DESC
    `)) as unknown as VinculoLinha[];
    const porCod = new Map<string, VinculoLinha>();
    for (const v of vinc) porCod.set(v.cod_cliente, v);
    return base.map((c) => {
      const v = porCod.get(c.codCliente);
      const opcaoId = v
        ? opcaoIdDoVinculo({
            tipoServico: v.tipo_servico,
            empresaCodigo: v.empresa_codigo,
            filial: v.filial,
            isFopag: v.is_fopag,
          })
        : null;
      return {
        // O `...c` traz `segmentoId` e `comercialId` de graça, que são IDs e não dado pessoal. O
        // rótulo do segmento vai junto; o do comercial NÃO (ver o bloco acima).
        ...c,
        segmentoRotulo: c.segmentoId === null ? null : (rotuloDoSegmento.get(c.segmentoId) ?? null),
        empresaVinculo: v?.empresa_resolvida ?? null,
        cnpjVinculo: v?.cnpj_resolvido ?? null,
        tipoServico: v?.tipo_servico ?? null,
        tipoServicoRotulo: v?.tipo_servico
          ? (TIPO_SERVICO_ROTULO[v.tipo_servico] ?? v.tipo_servico)
          : null,
        // Id da opção do catálogo p/ pré-selecionar no editar; null = vínculo sem CNPJ conhecido/ausente.
        vinculoOpcaoId: opcaoId,
      };
    });
  }

  /** Opções válidas de vínculo (empresa Soulan/tipo) para o select de edição do cliente. */
  opcoesVinculo() {
    return VINCULO_OPCOES.map((o) => ({ id: o.id, label: o.label, tipoServico: o.tipoServico }));
  }

  /**
   * TROCA o vínculo cliente↔empresa Soulan do cliente para a opção escolhida (empresa/tipo/filial →
   * entidade + CNPJ resolvidos pela view). Atualiza o vínculo único do cliente; cria se não houver.
   * Não inventa CNPJ — só aplica opções do catálogo (CNPJs do diretor). §A.6: sem log de CNPJ.
   */
  async definirVinculo(codCliente: string, opcaoId: string) {
    const opcao = VINCULO_OPCOES.find((o) => o.id === opcaoId);
    if (!opcao) throw new BadRequestException("Opção de vínculo inválida.");

    const cliente = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, codCliente),
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");

    let entidadeId: string | null = null;
    if (opcao.entidadeNome) {
      const [ent] = await this.db
        .select({ id: entidadesSoulan.id })
        .from(entidadesSoulan)
        .where(eq(entidadesSoulan.nome, opcao.entidadeNome));
      if (!ent) {
        throw new BadRequestException(
          "Entidade Soulan da opção não está cadastrada (rode o seed de entidades).",
        );
      }
      entidadeId = ent.id;
    }

    const valores = {
      empresaCodigo: opcao.empresaCodigo,
      filial: opcao.filial,
      tipoServico: opcao.tipoServico,
      isFopag: opcao.isFopag,
      entidadeId,
      ativo: true,
      atualizadoEm: new Date(),
    };

    /**
     * UPSERT POR TIPO DE CONTRATO (OST Onda 3, item 7, Bloco 2), e não mais "atualiza a primeira
     * linha que achar". Esta troca de uma linha é o que LIGA o eixo do vínculo:
     *  - mesma opção, mesmo tipo -> atualiza aquele vínculo, exatamente como fazia antes;
     *  - opção de OUTRO tipo -> nasce um SEGUNDO vínculo, e o cliente passa a operar os dois
     *    contratos com régua, obrigatoriedade e assinante próprios.
     * Antes, escolher o segundo tipo SOBRESCREVIA o primeiro, e era por isso que os 135 vínculos da
     * base tinham um tipo cada: a estrutura permitia dois, o caminho de escrita não.
     */
    const [existente] = await this.db
      .select({ id: clienteVinculos.id })
      .from(clienteVinculos)
      .where(
        and(
          eq(clienteVinculos.codCliente, codCliente),
          eq(clienteVinculos.tipoServico, opcao.tipoServico),
        ),
      );

    if (existente) {
      await this.db
        .update(clienteVinculos)
        .set(valores)
        .where(eq(clienteVinculos.id, existente.id));
    } else {
      await this.db.insert(clienteVinculos).values({ codCliente, ...valores });
    }
    return { ok: true, tipoServico: opcao.tipoServico };
  }

  /** Vínculos (contratos) de um cliente, para a tela mostrar quando há mais de um. */
  async listarVinculos(codCliente: string) {
    const linhas = await this.db
      .select({
        id: clienteVinculos.id,
        tipoServico: clienteVinculos.tipoServico,
        empresaCodigo: clienteVinculos.empresaCodigo,
        filial: clienteVinculos.filial,
        isFopag: clienteVinculos.isFopag,
        ativo: clienteVinculos.ativo,
      })
      .from(clienteVinculos)
      .where(eq(clienteVinculos.codCliente, codCliente))
      .orderBy(asc(clienteVinculos.tipoServico));
    return linhas.map((v) => ({ ...v, rotulo: ROTULO_TIPO_SERVICO[v.tipoServico as keyof typeof ROTULO_TIPO_SERVICO] ?? v.tipoServico }));
  }

  /**
   * Remove um vínculo do cliente. As admissões que apontam para ele NÃO são apagadas: o ponteiro cai
   * para null (o FK das admissões não é cascade) e elas voltam a resolver pela configuração do
   * cliente, que é o comportamento seguro. A régua e a config PRÓPRIAS daquele vínculo saem junto
   * (cascade), porque sem o vínculo elas não têm dono.
   */
  async removerVinculo(codCliente: string, vinculoId: string) {
    const [v] = await this.db
      .select({ id: clienteVinculos.id })
      .from(clienteVinculos)
      .where(and(eq(clienteVinculos.codCliente, codCliente), eq(clienteVinculos.id, vinculoId)));
    if (!v) throw new NotFoundException("Vínculo não encontrado para este cliente.");
    await this.db
      .update(admissoes)
      .set({ clienteVinculoId: null })
      .where(eq(admissoes.clienteVinculoId, vinculoId));
    await this.db.delete(clienteVinculos).where(eq(clienteVinculos.id, vinculoId));
    return { ok: true };
  }

  async create(dto: CreateClienteDto) {
    const existing = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (existing) throw new ConflictException("cod_cliente já cadastrado");
    // A MESMA CONFERÊNCIA DA EDIÇÃO, e ela precisa estar NAS DUAS PORTAS: `values(dto)` grava o
    // corpo inteiro, então um id inexistente aqui viraria 500 de FK e um id INATIVO entraria
    // normalmente, criando cliente novo apontando para um segmento fora de circulação.
    await this.conferirSegmentoEComercial(dto);
    const [row] = await this.db.insert(clientes).values(dto).returning();
    return row;
  }

  async update(codCliente: string, dto: UpdateClienteDto) {
    await this.conferirSegmentoEComercial(dto);
    const [row] = await this.db
      .update(clientes)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(clientes.codCliente, codCliente))
      .returning();
    if (!row) throw new NotFoundException("Cliente não encontrado");
    return row;
  }

  /**
   * ─ O SEGMENTO E O COMERCIAL ESCOLHIDOS, CONFERIDOS CONTRA OS DOIS CATÁLOGOS (Onda E) ──────────
   *
   * ┌─ TRÊS ESTADOS, E CADA UM TEM DE SER TRATADO DIFERENTE ────────────────────────────────────┐
   * │ CAMPO AUSENTE (`undefined`) = NÃO MEXER. É o `PATCH` que veio para trocar outra coisa, e   │
   * │   nem chega a ser conferido: o `...dto` não escreve a coluna.                              │
   * │ `null` = LIMPAR, e é operação legítima (o admin classificou errado e está desfazendo). É a │
   * │   mesma régua dos campos de benefício, logo ao lado no DTO.                                │
   * │ NÚMERO = CONFERIDO contra o catálogo vivo, e id inexistente ou INATIVO **LANÇA**. Não vira │
   * │   `null` em silêncio: nulo aqui é o que a VAGA herda, então engolir a escolha faria a vaga │
   * │   toda do cliente mudar de dono sem ninguém ter pedido.                                    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA NÃO É REESCRITA: são as MESMAS funções puras dos dois catálogos. As tabelas são curtas
   * e a leitura direta evita injetar dois serviços de outro módulo (`AsModule`) neste, que nasceu
   * sem essa dependência.
   *
   * §A.6: a lista de nomes de comercial é lida só para conferir a escolha, morre no fim desta
   * função e não sai em resposta nenhuma.
   */
  private async conferirSegmentoEComercial(dto: {
    segmentoId?: number | null;
    comercialId?: number | null;
  }): Promise<void> {
    if (typeof dto.segmentoId === "number") {
      const segmentos = await this.db
        .select({
          id: asSegmentos.id,
          codigo: asSegmentos.codigo,
          rotulo: asSegmentos.rotulo,
          ordem: asSegmentos.ordem,
          ativo: asSegmentos.ativo,
        })
        .from(asSegmentos);
      segmentoEscolhido(segmentos, dto.segmentoId);
    }
    if (typeof dto.comercialId === "number") {
      const comerciais = await this.db
        .select({
          id: asComerciais.id,
          rotulo: asComerciais.rotulo,
          ordem: asComerciais.ordem,
          ativo: asComerciais.ativo,
        })
        .from(asComerciais);
      comercialEscolhido(comerciais, dto.comercialId);
    }
  }

  /**
   * ─ OS COMERCIAIS, PARA O SELETOR DO CADASTRO DE CLIENTE (Onda E) ──────────────────────────────
   *
   * ELE NÃO EXISTE COMO ROTA ABERTA EM LUGAR NENHUM, e é por isso que existe aqui: a lista é de
   * NOMES DE PESSOA, e um `GET /as/comerciais` aberto entregaria a folha do time comercial a
   * qualquer sessão válida. Quem alcança este método alcança a superfície de ADMINISTRAÇÃO de
   * clientes, que é exatamente quem precisa escolher o comercial do cliente.
   *
   * ┌─ `incluirInativos` EVITA UMA PERDA DE DADO SILENCIOSA, e não é conveniência de tela ────────┐
   * │ O padrão ESCONDE quem saiu da empresa, porque cadastro novo não se oferece a quem saiu. Mas │
   * │ o cliente cujo comercial foi inativado PRECISA continuar mostrando o vínculo dele: sem os   │
   * │ inativos, o seletor não acha o valor guardado, cai no placeholder, o campo passa a valer    │
   * │ vazio, e o primeiro "Salvar alterações" feito para mudar OUTRA COISA manda `null` e APAGA o │
   * │ vínculo. Nada falha, e ninguém liga uma coisa à outra depois.                                │
   * │                                                                                              │
   * │ O NOME DO PARÂMETRO É MASCULINO E ISSO IMPORTA: escrito errado, ele não dá 400, cai no       │
   * │ padrão e devolve só os ativos. O modo de falha é exatamente o parágrafo acima.               │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NA ORDEM DO CATÁLOGO, que é a do diretor, e não em ordem alfabética.
   */
  async comerciais(incluirInativos = false): Promise<{ id: number; rotulo: string; ativo: boolean }[]> {
    return this.db
      .select({ id: asComerciais.id, rotulo: asComerciais.rotulo, ativo: asComerciais.ativo })
      .from(asComerciais)
      // `undefined` no `where` é o filtro AUSENTE, e não um filtro vazio: é assim que o drizzle
      // deixa a mesma consulta servir os dois casos sem duplicar a projeção e a ordenação.
      .where(incluirInativos ? undefined : eq(asComerciais.ativo, true))
      .orderBy(asc(asComerciais.ordem), asc(asComerciais.id));
  }

  /**
   * Admissões EM ANDAMENTO do cliente (para o aviso ao inativar). Não bloqueia nada — é informação
   * para o admin decidir. NÃO expõe CPF (só nome + farol, dado operacional).
   */
  async dependenciasAtivas(codCliente: string) {
    return this.db
      .select({ id: admissoes.id, candidato: candidatos.nome, farol: admissoes.farolGlobal })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(
        and(
          eq(admissoes.codCliente, codCliente),
          notInArray(admissoes.farolGlobal, [...FAROIS_TERMINAIS]),
        ),
      );
  }

  /**
   * INATIVA o cliente (ativo=false). NUNCA exclusão física, NUNCA cascata: o histórico (admissões,
   * régua, vínculos) é preservado; o cliente apenas sai das opções selecionáveis (wizard/esteira já
   * filtram ativo=true). AVISA listando as admissões em andamento afetadas — mas não bloqueia.
   */
  async inativar(codCliente: string) {
    const [row] = await this.db
      .update(clientes)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(clientes.codCliente, codCliente))
      .returning({ cod: clientes.codCliente });
    if (!row) throw new NotFoundException("Cliente não encontrado");
    const admissoesAfetadas = await this.dependenciasAtivas(codCliente);
    return { ok: true, ativo: false, admissoesAfetadas };
  }

  /** Reativa o cliente (volta às opções selecionáveis). */
  async reativar(codCliente: string) {
    const [row] = await this.db
      .update(clientes)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(clientes.codCliente, codCliente))
      .returning({ cod: clientes.codCliente });
    if (!row) throw new NotFoundException("Cliente não encontrado");
    return { ok: true, ativo: true };
  }
}
