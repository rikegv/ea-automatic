import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { clientePendenciaConfig, clientes } from "../../db/schema";
import {
  ehChaveValida,
  itensDoCliente,
  type ChavePendencia,
  type ItemConfigPendencia,
} from "../../domain/pendencia-config";
import { configPorCliente, doMapa } from "../../regua/pendencia-config.repo";
import type { AplicarEmMassaDto, AtualizarItemDto } from "./pendencias-cliente.dto";

/** Uma linha da tela: o cliente e a configuração completa dele. */
export interface LinhaPendenciaCliente {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  /** Quantos itens estão DESLIGADOS (o número que a tela mostra sem abrir o cliente). */
  desligados: number;
  itens: ItemConfigPendencia[];
}

/**
 * GESTÃO DA OBRIGATORIEDADE DE PENDÊNCIAS POR CLIENTE (OST da tela de obrigatoriedade).
 *
 * O PROBLEMA: a régua de pendências obrigatórias era GLOBAL. Cliente que não trabalha com Centro de
 * Custo era cobrado por ele e aparecia "parcial" sem ter nada errado no processo dele.
 *
 * O DESENHO, em uma frase: a tabela guarda o que está DESLIGADO, então **ausência de linha significa
 * obrigatório** e nenhum cliente muda até o diretor mexer. Ligar de volta APAGA a linha em vez de
 * gravar `true`, o que mantém a tabela enxuta e o padrão como padrão de verdade.
 *
 * APLICAÇÃO EM MASSA é requisito, não conveniência: são 233 clientes, e configurar um a um seria
 * inviável. A operação é a MESMA alteração para N clientes, numa transação só.
 *
 * §A.6: código de cliente e chave de item. Nenhum dado pessoal em nenhum ponto.
 */
@Injectable()
export class PendenciasClienteService {
  private readonly logger = new Logger("PendenciasClienteService");

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lista os clientes com a configuração de cada um. Sem paginação de propósito: são 233 linhas de
   * texto curto, e a tela precisa do conjunto inteiro para a seleção múltipla e o filtro funcionarem
   * sem ida e volta ao servidor a cada busca.
   */
  async listar(): Promise<LinhaPendenciaCliente[]> {
    const linhas = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
      })
      .from(clientes)
      .orderBy(asc(clientes.razaoSocial));

    const configs = await configPorCliente(
      this.db,
      linhas.map((l) => l.codCliente),
    );

    return linhas.map((l) => {
      const itens = itensDoCliente(doMapa(configs, l.codCliente));
      return {
        codCliente: l.codCliente,
        razaoSocial: l.razaoSocial,
        nomeOperacao: l.nomeOperacao,
        desligados: itens.filter((i) => !i.obrigatorio).length,
        itens,
      };
    });
  }

  /** Configuração de UM cliente (edição individual, ajuste fino). */
  async obter(codCliente: string): Promise<LinhaPendenciaCliente> {
    const [cli] = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
      })
      .from(clientes)
      .where(eq(clientes.codCliente, codCliente));
    if (!cli) throw new NotFoundException("Cliente não encontrado");

    const configs = await configPorCliente(this.db, [codCliente]);
    const itens = itensDoCliente(doMapa(configs, codCliente));
    return {
      ...cli,
      desligados: itens.filter((i) => !i.obrigatorio).length,
      itens,
    };
  }

  /** Edição INDIVIDUAL: aplica os itens informados a UM cliente. */
  async atualizar(codCliente: string, itens: AtualizarItemDto[]): Promise<LinhaPendenciaCliente> {
    await this.aplicar([codCliente], itens);
    return this.obter(codCliente);
  }

  /**
   * APLICAÇÃO EM MASSA: a mesma alteração para N clientes, numa transação. Devolve o que mudou para
   * a tela confirmar o efeito ("desliguei X em N clientes"), sem precisar recarregar para saber.
   */
  async aplicarEmMassa(dto: AplicarEmMassaDto): Promise<{
    clientesAfetados: number;
    itensAplicados: number;
    desligados: string[];
    religados: string[];
  }> {
    // Só códigos que EXISTEM: um código inventado no payload não vira linha órfã (a FK barraria, mas
    // aqui a mensagem é honesta e a transação não quebra pela metade).
    const existentes = await this.db
      .select({ cod: clientes.codCliente })
      .from(clientes)
      .where(inArray(clientes.codCliente, dto.codClientes));
    const codigos = existentes.map((c) => c.cod);
    if (codigos.length === 0) throw new NotFoundException("Nenhum cliente válido na seleção.");

    await this.aplicar(codigos, dto.itens);

    const desligados = dto.itens.filter((i) => !i.obrigatorio).map((i) => i.chave);
    const religados = dto.itens.filter((i) => i.obrigatorio).map((i) => i.chave);
    // §A.6: contagens e chaves de item; nenhum nome de cliente ou pessoa.
    this.logger.log(
      `Obrigatoriedade aplicada em massa: ${codigos.length} cliente(s), ` +
        `${desligados.length} item(ns) desligado(s), ${religados.length} religado(s).`,
    );
    return {
      clientesAfetados: codigos.length,
      itensAplicados: dto.itens.length,
      desligados,
      religados,
    };
  }

  /**
   * O ESCRITOR ÚNICO. Desligar GRAVA a linha; religar APAGA, porque o padrão é obrigatório e linha
   * com `obrigatorio = true` seria ruído com o mesmo significado da ausência.
   */
  private async aplicar(codClientes: string[], itens: AtualizarItemDto[]): Promise<void> {
    const validos = itens.filter((i) => ehChaveValida(i.chave));
    if (validos.length === 0 || codClientes.length === 0) return;

    const desligar = validos.filter((i) => !i.obrigatorio).map((i) => i.chave as ChavePendencia);
    const religar = validos.filter((i) => i.obrigatorio).map((i) => i.chave as ChavePendencia);

    await this.db.transaction(async (tx) => {
      if (desligar.length > 0) {
        await tx
          .insert(clientePendenciaConfig)
          .values(
            codClientes.flatMap((codCliente) =>
              desligar.map((chave) => ({ codCliente, chave, obrigatorio: false })),
            ),
          )
          .onConflictDoUpdate({
            // Mesma causa do incidente da régua (migração 0056 trocou o unique simples por índice
            // PARCIAL): sem o predicado, esta tela também devolvia 500. Config do cliente inteiro,
            // então o alvo é o índice de vínculo nulo.
            target: [clientePendenciaConfig.codCliente, clientePendenciaConfig.chave],
            targetWhere: isNull(clientePendenciaConfig.clienteVinculoId),
            set: { obrigatorio: false, atualizadoEm: new Date() },
          });
      }
      if (religar.length > 0) {
        await tx
          .delete(clientePendenciaConfig)
          .where(
            and(
              inArray(clientePendenciaConfig.codCliente, codClientes),
              inArray(clientePendenciaConfig.chave, religar),
            ),
          );
      }
    });
  }
}
