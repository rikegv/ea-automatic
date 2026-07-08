import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { admissoes, candidatos, clientes, clienteVinculos, entidadesSoulan } from "../../db/schema";
import type { CreateClienteDto, UpdateClienteDto } from "./clientes.dto";
import { opcaoIdDoVinculo, VINCULO_OPCOES } from "./vinculo-opcoes";

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
        ...c,
        empresaVinculo: v?.empresa_resolvida ?? null,
        cnpjVinculo: v?.cnpj_resolvido ?? null,
        tipoServico: v?.tipo_servico ?? null,
        tipoServicoRotulo: v?.tipo_servico ? (TIPO_SERVICO_ROTULO[v.tipo_servico] ?? v.tipo_servico) : null,
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

    const existentes = await this.db
      .select({ id: clienteVinculos.id })
      .from(clienteVinculos)
      .where(eq(clienteVinculos.codCliente, codCliente));

    if (existentes.length > 0) {
      await this.db.update(clienteVinculos).set(valores).where(eq(clienteVinculos.id, existentes[0].id));
    } else {
      await this.db.insert(clienteVinculos).values({ codCliente, ...valores });
    }
    return { ok: true, tipoServico: opcao.tipoServico };
  }

  async create(dto: CreateClienteDto) {
    const existing = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (existing) throw new ConflictException("cod_cliente já cadastrado");
    const [row] = await this.db.insert(clientes).values(dto).returning();
    return row;
  }

  async update(codCliente: string, dto: UpdateClienteDto) {
    const [row] = await this.db
      .update(clientes)
      .set({ ...dto, atualizadoEm: new Date() })
      .where(eq(clientes.codCliente, codCliente))
      .returning();
    if (!row) throw new NotFoundException("Cliente não encontrado");
    return row;
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
