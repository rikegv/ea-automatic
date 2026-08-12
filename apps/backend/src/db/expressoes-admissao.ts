import { sql } from "drizzle-orm";
import { admissoes } from "./schema";

/**
 * EXPRESSÕES SQL COMPARTILHADAS sobre `admissoes`, para os mesmos baldes serem contados do mesmo
 * jeito em toda superfície.
 *
 * POR QUE ELAS SAÍRAM DO `admissoes.service` (decisão do diretor, onda 4 do Alto Volume): o painel do
 * projeto responde "quantas concluíram" sobre as MESMAS admissões que o Gerenciador conta. Se cada
 * tela escrevesse a própria condição, a primeira mudança de regra (foi assim que a frente INTEGRAÇÃO
 * entrou) passaria a valer num lugar e não no outro, e os dois números se contradiriam sem que nada
 * quebrasse. Copiar era a divergência garantida; extrair é a única forma de os dois mudarem juntos.
 *
 * Ficam em `db/` e não em `domain/` porque carregam SQL e referenciam a tabela: `domain/` é regra
 * pura, sem dependência de banco, e é essa separação que deixa aquele diretório testável isolado.
 *
 * NÃO ficam em `db/schema` porque não são estrutura, são LEITURA: o schema descreve o que existe, e
 * isto descreve como o negócio interpreta o que existe.
 */

/**
 * "CONCLUÍDA" = terminou o Cadastro E NÃO tem integração PENDENTE.
 *
 * A frente INTEGRAÇÃO entrou como última etapa da esteira, então "cadastro concluído" deixou de
 * significar "processo terminado" para quem ainda vai passar por ela. Sem a segunda metade desta
 * expressão, uma admissão viva EM INTEGRAÇÃO contaria como Concluída enquanto o time ainda trabalha
 * nela.
 *
 * QUEM DECIDE É A PRESENÇA DA FRENTE, e não a configuração do cliente (leitura confirmada pelo
 * diretor). A diferença não é acadêmica: hoje todos os clientes exigem integração por default, e
 * nenhuma das admissões antigas tem a frente, porque a não retroatividade impediu. Olhar a
 * configuração do cliente ZERARIA o KPI e reescreveria o passado; olhar a frente preserva as antigas
 * (que não têm integração pendente) e faz só as novas esperarem.
 *
 * Cliente que NÃO exige integração também segue contando no Cadastro: a frente nunca nasce para ele,
 * então nunca há integração pendente.
 */
export const admissaoConcluidaSql = sql<boolean>`(
      EXISTS (SELECT 1 FROM frentes_admissao f WHERE f.admissao_id = ${admissoes.id} AND f.tipo = 'CADASTRO_CONTRATO' AND f.concluida = true)
      AND NOT EXISTS (SELECT 1 FROM frentes_admissao i WHERE i.admissao_id = ${admissoes.id} AND i.tipo = 'INTEGRACAO' AND i.concluida = false)
    )`;

/**
 * "EM ANDAMENTO" = admissão EM ABERTO no geral: nem concluída nem declínio/rescisão. São os faróis
 * de processo vivo (EM_ADMISSAO, BANCO_AGUARDAR).
 *
 * PAUSA: "em andamento" é trabalho andando. Pausada, por definição, não está andando, e por isso ela
 * tem balde próprio (decisão do diretor) em vez de sumir da conta.
 */
export const admissaoEmAndamentoSql = sql<boolean>`(${admissoes.farolGlobal} IN ('EM_ADMISSAO', 'BANCO_AGUARDAR') AND ${admissoes.pausadaEm} IS NULL)`;
