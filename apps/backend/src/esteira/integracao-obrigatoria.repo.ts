import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { clientePendenciaConfig } from "../db/schema";

/**
 * O CLIENTE EXIGE INTEGRAÇÃO? (frente INTEGRAÇÃO, decisão do diretor)
 *
 * A regra: todo cliente nasce exigindo integração, e a equipe DESMARCA quem não exige. Cliente que
 * não exige nem avança para a frente, fecha no Cadastro e vai para o Gerenciador.
 *
 * REUSA A TABELA `cliente_pendencia_config`, com a chave `INTEGRACAO`, e por dois motivos: ela já
 * tem exatamente a forma de que se precisa, `(cod_cliente, chave) -> obrigatorio boolean NOT NULL
 * DEFAULT true`, e o default `true` entrega o "todos nascem exigindo" sem popular uma linha sequer.
 * Zero migration.
 *
 * MAS A LEITURA É PRÓPRIA, e não o `configDoCliente` da régua, de propósito. Aquele filtra por
 * `ehChaveValida`, o conjunto de chaves de PENDÊNCIA do domínio (centro de custo, setor e afins), e
 * é o que alimenta a tela de obrigatoriedade por cliente. Entrar naquele conjunto faria a integração
 * aparecer como se fosse um campo obrigatório de admissão, que ela não é: ela é regra de PROCESSO.
 * Um leitor estreito mantém a tabela compartilhada sem misturar os dois assuntos.
 *
 * §A.6: só código de cliente e chave, sem nenhum dado pessoal.
 */
export const CHAVE_INTEGRACAO = "INTEGRACAO";

/**
 * `true` quando o cliente exige integração. AUSÊNCIA DE LINHA É `true`: é o estado de quem nunca foi
 * configurado, e é o default pedido pelo diretor. Só uma linha explícita com `obrigatorio = false`
 * tira o cliente da frente.
 *
 * Cliente nulo (pré-admissão, ainda sem cliente atribuído) devolve `false`: sem cliente não há regra
 * a aplicar, e criar a frente aí seria adivinhar.
 */
export async function clienteExigeIntegracao(
  db: Database,
  codCliente: string | null | undefined,
): Promise<boolean> {
  if (!codCliente) return false;
  const [linha] = await db
    .select({ obrigatorio: clientePendenciaConfig.obrigatorio })
    .from(clientePendenciaConfig)
    .where(
      and(
        eq(clientePendenciaConfig.codCliente, codCliente),
        eq(clientePendenciaConfig.chave, CHAVE_INTEGRACAO),
        // Só a linha do CLIENTE. A precedência por vínculo existe para pendência de campo; a
        // integração é decidida por cliente, que é como o diretor descreveu a tela de gestão.
        isNull(clientePendenciaConfig.clienteVinculoId),
      ),
    );
  return linha ? linha.obrigatorio : true;
}
