import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { clientePendenciaConfig, clientes } from "../../db/schema";
import { CHAVE_INTEGRACAO } from "../../esteira/integracao-obrigatoria.repo";

/**
 * GESTÃO DA INTEGRAÇÃO OBRIGATÓRIA POR CLIENTE (onda 5 da frente Integração).
 *
 * A regra do diretor: todo cliente NASCE exigindo integração, e a equipe DESMARCA quem não exige.
 * Cliente que não exige nem avança para a frente, fecha no Cadastro e vai para o Gerenciador.
 *
 * REUSA `cliente_pendencia_config` com a chave `INTEGRACAO`, a mesma tabela da obrigatoriedade de
 * campos, porque ela já tem exatamente a forma necessária e o default `true` entrega o "todos nascem
 * exigindo" sem popular uma linha sequer. Zero migration.
 *
 * AUSÊNCIA DE LINHA VALE `true`, e é isso que a tela mostra para quem nunca foi configurado. Só uma
 * linha explícita com `obrigatorio = false` tira o cliente da frente. Por isso desmarcar GRAVA uma
 * linha e marcar de volta pode simplesmente APAGÁ-LA: o estado "exige" é o default, e guardar linha
 * redundante para 235 clientes seria sujeira sem função.
 *
 * A leitura que o nascimento lazy usa (`clienteExigeIntegracao`) é outra função, estreita, no módulo
 * da esteira. As duas concordam por construção porque olham a MESMA chave na MESMA tabela, e a chave
 * vem de uma constante compartilhada, não de dois literais soltos.
 *
 * §A.6: só código de cliente, razão social e um booleano. Nenhum dado pessoal.
 */
@Injectable()
export class IntegracaoClientesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Todos os clientes ATIVOS com a exigência de cada um. Inativos ficam de fora: não há admissão
   * nova para cliente encerrado, então configurá-lo seria trabalho sem efeito (mesmo critério do
   * sinal de Fopag, §A.6 do diagnóstico).
   */
  async listar() {
    const linhas = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        obrigatorio: clientePendenciaConfig.obrigatorio,
      })
      .from(clientes)
      .leftJoin(
        clientePendenciaConfig,
        and(
          eq(clientePendenciaConfig.codCliente, clientes.codCliente),
          eq(clientePendenciaConfig.chave, CHAVE_INTEGRACAO),
          isNull(clientePendenciaConfig.clienteVinculoId),
        ),
      )
      .where(eq(clientes.ativo, true))
      .orderBy(asc(clientes.razaoSocial));

    return linhas.map((l) => ({
      codCliente: l.codCliente,
      razaoSocial: l.razaoSocial,
      nomeOperacao: l.nomeOperacao,
      // Sem linha = exige. É o default da coluna e a regra do diretor.
      exigeIntegracao: l.obrigatorio ?? true,
    }));
  }

  /**
   * Marca ou desmarca a exigência para N clientes de uma vez (a tela seleciona vários).
   *
   * `exige = false` grava a linha; `exige = true` APAGA, voltando ao default. Guardar linha com
   * `obrigatorio = true` funcionaria igual, mas encheria a tabela de registros que dizem o que o
   * default já diz, e a tela de pendências de campo (que lê a mesma tabela) passaria a exibir uma
   * chave que não é dela.
   */
  async definir(codClientes: string[], exige: boolean) {
    const codigos = [...new Set(codClientes)].filter(Boolean);
    if (codigos.length === 0) return { alterados: 0 };

    if (exige) {
      await this.db
        .delete(clientePendenciaConfig)
        .where(
          and(
            inArray(clientePendenciaConfig.codCliente, codigos),
            eq(clientePendenciaConfig.chave, CHAVE_INTEGRACAO),
            isNull(clientePendenciaConfig.clienteVinculoId),
          ),
        );
      return { alterados: codigos.length };
    }

    for (const cod of codigos) {
      await this.db
        .insert(clientePendenciaConfig)
        .values({ codCliente: cod, chave: CHAVE_INTEGRACAO, obrigatorio: false })
        .onConflictDoUpdate({
          // O unique desta tabela é um índice PARCIAL (`uq_cliente_pendencia ... WHERE
          // cliente_vinculo_id IS NULL`, migration 0056). Sem repetir o predicado, o Postgres não
          // encontra índice que case com o ON CONFLICT e devolve 500. É EXATAMENTE o mesmo incidente
          // que a tela de obrigatoriedade de campos já teve, e o comentário lá registra o mesmo
          // aprendizado. Config do cliente inteiro, então o alvo é o índice de vínculo nulo.
          target: [clientePendenciaConfig.codCliente, clientePendenciaConfig.chave],
          targetWhere: isNull(clientePendenciaConfig.clienteVinculoId),
          set: { obrigatorio: false, atualizadoEm: new Date() },
        });
    }
    return { alterados: codigos.length };
  }
}
