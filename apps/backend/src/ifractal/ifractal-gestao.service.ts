import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { type TipoMarcacao } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, clientes, frentesAdmissao } from "../db/schema";

/**
 * O MENU GERENCIAL DO IFRACTAL: GESTÃO E CONFIGURAÇÃO, não operação.
 *
 * A PRIMEIRA VERSÃO DESTA TELA ESTAVA ERRADA, e a correção vale ser registrada. Ela listava as
 * ADMISSÕES com status e credencial, ou seja, era uma segunda cópia da aba da Esteira, com os mesmos
 * dados e outro endereço. Tela de gestão que repete a fila de trabalho não é gestão: é duplicata, e
 * duplicata diverge no primeiro ajuste feito de um lado só.
 *
 * O QUE ESTA TELA É, agora: o lugar onde se CONFIGURA a frente do iFractal.
 *   1. os CLIENTES e o tipo de marcação de cada um, editável aqui mesmo, porque a pergunta
 *      "qual cliente usa qual tipo?" é de cadastro e não de admissão;
 *   2. a LISTA DE STATUS da frente (no `IfractalStatusService`).
 *
 * A operação, isto é, quem é o funcionário e qual a credencial dele, vive na ABA DA ESTEIRA e só lá.
 *
 * §A.6: nenhuma credencial e nenhum dado pessoal saem daqui. Só cliente, tipo de marcação e
 * contagem de admissões, que é o que a gestão precisa ver.
 */
@Injectable()
export class IfractalGestaoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Os clientes com o tipo de marcação e QUANTAS admissões cada um tem na frente do iFractal.
   *
   * A contagem existe para a decisão não ser às cegas: trocar o tipo de marcação de um cliente
   * afeta todas as admissões dele por herança, e quem edita precisa ver o tamanho do que está
   * mexendo. Conta só a frente do iFractal, e não admissão em geral, porque é dela que a tela trata.
   */
  async listarClientes() {
    const linhas = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        tipoMarcacao: clientes.tipoMarcacao,
        ativo: clientes.ativo,
        admissoesNaFrente: sql<number>`(
          select count(*)::int from ${frentesAdmissao} f
           join ${admissoes} a on a.id = f.admissao_id
          where f.tipo = 'IFRACTAL' and a.cod_cliente = ${clientes.codCliente}
        )`,
      })
      .from(clientes)
      .orderBy(asc(clientes.razaoSocial));

    const items = linhas.map((l) => ({
      ...l,
      cliente: l.nomeOperacao || l.razaoSocial,
    }));

    /**
     * SEM KPI DE DISTRIBUIÇÃO, e a remoção é deliberada (decisão do diretor ao validar).
     *
     * A tela tinha cards "Cartão: 0 / Biometria: 0 / Aplicativo: 238". Dois problemas: esta é tela
     * de GESTÃO, não de análise, e clicar num card levava a filtrar, misturando indicador com
     * atalho de ação. O número por tipo, quando fizer falta, é pergunta de painel, não de cadastro.
     */
    return { items, total: items.length };
  }

  /**
   * Edita UM cliente a partir da tela do iFractal: tipo de marcação e situação.
   *
   * ESCRITA MÍNIMA, de propósito: toca `clientes` e nada mais. O TIPO é herdado por leitura pelas
   * admissões, então não há o que propagar, não há frente que mude de status e não há contagem que
   * se mova. É o mesmo caminho do formulário de Clientes, exposto onde o time do ponto trabalha.
   *
   * Só grava o que VEIO no corpo. Campo ausente é campo não mexido, e é isso que deixa o lápis
   * salvar o tipo sem tocar na situação, e vice-versa.
   */
  async editarCliente(codCliente: string, dto: { tipoMarcacao?: TipoMarcacao; ativo?: boolean }) {
    const patch: Record<string, unknown> = { atualizadoEm: new Date() };
    if (dto.tipoMarcacao !== undefined) patch.tipoMarcacao = dto.tipoMarcacao;
    // `ativo` ALCANÇA MAIS QUE ESTA TELA: cliente inativo some dos seletores do sistema inteiro
    // (§A.27). Por isso só é escrito quando vem no corpo, nunca por tabela.
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;

    const [upd] = await this.db
      .update(clientes)
      .set(patch)
      .where(eq(clientes.codCliente, codCliente))
      .returning({
        codCliente: clientes.codCliente,
        tipoMarcacao: clientes.tipoMarcacao,
        ativo: clientes.ativo,
      });
    if (!upd) throw new NotFoundException("Cliente não encontrado.");
    return upd;
  }
}
