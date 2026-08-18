import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { clienteBeneficioRegra, clientes } from "../db/schema";
import {
  CHAVES_REGRA_BENEFICIO,
  ROTULO_REGRA_BENEFICIO,
  type ChaveRegraBeneficio,
} from "../domain/regras-beneficio";

/**
 * REGRAS DE BENEFÍCIO DO CLIENTE (onda 2). A regra escrita que o time consulta ao lançar o benefício:
 * "VT sem desconto em folha", "VR descontado 10%", "AM sem coparticipação".
 *
 * SERVIÇO NOVO, e não métodos a mais no `BeneficiosFilaService` (§A.26): aquele arquivo é a fila,
 * já validado e consumido pela tela inteira, e uma frente de cadastro de texto não tem por que
 * alcançá-lo. Aqui não há uma linha que leia admissão, frente, farol ou régua.
 *
 * §A.27: a tabela NASCE VAZIA e nada no sistema a lê além desta tela. Não entra em contagem, KPI,
 * farol, sinalizador nem pendência. Cliente sem regra cadastrada não passa a ter pendência nenhuma:
 * ele simplesmente aparece como "não informado" no modal.
 *
 * §A.6: política comercial do cliente. Sem PII, sem CPF, sem nome de pessoa.
 */
@Injectable()
export class RegrasBeneficioService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * As regras do cliente, SEMPRE com os seis grupos, na ordem da tela. O grupo sem regra volta com
   * `texto: null`, e não some da resposta: o modal precisa dizer "não informado" para ele, e uma
   * resposta que omite o vazio obrigaria a tela a reconstruir a lista por conta própria.
   */
  async listar(codCliente: string) {
    const [cliente] = await this.db
      .select({ codCliente: clientes.codCliente, razaoSocial: clientes.razaoSocial })
      .from(clientes)
      .where(eq(clientes.codCliente, codCliente))
      .limit(1);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    const linhas = await this.db
      .select({
        beneficio: clienteBeneficioRegra.beneficio,
        texto: clienteBeneficioRegra.texto,
        atualizadoEm: clienteBeneficioRegra.atualizadoEm,
      })
      .from(clienteBeneficioRegra)
      .where(eq(clienteBeneficioRegra.codCliente, codCliente));
    const porChave = new Map(linhas.map((l) => [l.beneficio, l]));

    return {
      codCliente: cliente.codCliente,
      razaoSocial: cliente.razaoSocial,
      regras: CHAVES_REGRA_BENEFICIO.map((chave) => {
        const l = porChave.get(chave);
        return {
          beneficio: chave,
          rotulo: ROTULO_REGRA_BENEFICIO[chave],
          texto: l?.texto ?? null,
          atualizadoEm: l?.atualizadoEm ?? null,
        };
      }),
    };
  }

  /**
   * Grava as regras do cliente. O payload é a lista COMPLETA, então isto é um upsert do que veio com
   * texto e um DELETE do que veio vazio, na mesma transação: salvar duas vezes corrige em vez de
   * duplicar, e apagar o texto é como o time desfaz o que cadastrou errado.
   *
   * A ESCRITA É DO CLIENTE, e vale para todas as pessoas dele na hora. Quem avisa disso é a tela,
   * antes de salvar (decisão do diretor); aqui a escrita é uma só, por `cod_cliente`.
   */
  async salvar(codCliente: string, regras: { beneficio: string; texto: string }[]) {
    const [cliente] = await this.db
      .select({ codCliente: clientes.codCliente })
      .from(clientes)
      .where(eq(clientes.codCliente, codCliente))
      .limit(1);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    // Chave repetida no payload: fica a ÚLTIMA. A alternativa seria recusar o salvamento inteiro por
    // um detalhe de montagem da tela, e o upsert não tem como aplicar duas versões da mesma chave.
    const porChave = new Map<string, string>();
    for (const r of regras) porChave.set(r.beneficio, r.texto.trim());

    const comTexto = [...porChave.entries()].filter(([, t]) => t.length > 0);
    const semTexto = [...porChave.entries()].filter(([, t]) => t.length === 0).map(([c]) => c);

    await this.db.transaction(async (tx) => {
      if (semTexto.length > 0) {
        await tx
          .delete(clienteBeneficioRegra)
          .where(
            and(
              eq(clienteBeneficioRegra.codCliente, codCliente),
              inArray(clienteBeneficioRegra.beneficio, semTexto),
            ),
          );
      }
      for (const [beneficio, texto] of comTexto) {
        await tx
          .insert(clienteBeneficioRegra)
          .values({ codCliente, beneficio, texto })
          .onConflictDoUpdate({
            target: [clienteBeneficioRegra.codCliente, clienteBeneficioRegra.beneficio],
            set: { texto, atualizadoEm: new Date() },
          });
      }
    });

    return this.listar(codCliente);
  }
}

export type { ChaveRegraBeneficio };
