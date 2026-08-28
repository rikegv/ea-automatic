import { sql } from "drizzle-orm";
import { STATUS_EXAME_LIBERADO_SEM_ASO } from "@ea/shared-types";
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
/**
 * A TERCEIRA METADE, do "Liberado Para Cadastro Sem ASO" (decisão do diretor, D1 cirúrgica).
 *
 * O status novo destrava o avanço da admissão sem concluir o Exame: ela cadastra, integra e assina
 * com o ASO ainda pendente. Sem esta linha ela passaria a contar como CONCLUÍDA no Painel, no
 * Gerenciador e no Alto Volume assim que o Cadastro fechasse, e o diretor foi explícito: enquanto o
 * ASO não sobe, a admissão NÃO está concluída.
 *
 * O RECORTE É CIRÚRGICO DE PROPÓSITO, e a alternativa foi medida antes de ser recusada. Exigir "o
 * EXAME concluído" nesta expressão seria a regra mais óbvia e mexeria no PASSADO: 3 admissões da base
 * (exames CANCELADO, faróis DECLINOU e RESCISAO, contratos já assinados) sairiam da conta, e a
 * expressão é a mesma que três telas leem. Excluindo APENAS o status novo, que não existe em nenhuma
 * linha no dia em que sobe, o número não se move: 1749 antes, 1749 depois.
 *
 * O CASO SE DESFAZ SOZINHO: quando o ASO chega, a frente vira APTO, o status deixa de ser o liberado
 * e a admissão entra na conta pela regra de sempre, sem nada a corrigir à mão.
 */
export const admissaoConcluidaSql = sql<boolean>`(
      EXISTS (SELECT 1 FROM frentes_admissao f WHERE f.admissao_id = ${admissoes.id} AND f.tipo = 'CADASTRO_CONTRATO' AND f.concluida = true)
      AND NOT EXISTS (SELECT 1 FROM frentes_admissao i WHERE i.admissao_id = ${admissoes.id} AND i.tipo = 'INTEGRACAO' AND i.concluida = false)
      AND NOT EXISTS (SELECT 1 FROM frentes_admissao e WHERE e.admissao_id = ${admissoes.id} AND e.tipo = 'EXAME' AND e.status = ${STATUS_EXAME_LIBERADO_SEM_ASO})
    )`;

/**
 * "EM ANDAMENTO" = admissão EM ABERTO no geral: nem concluída nem declínio/rescisão. São os faróis
 * de processo vivo (EM_ADMISSAO, BANCO_AGUARDAR).
 *
 * PAUSA: "em andamento" é trabalho andando. Pausada, por definição, não está andando, e por isso ela
 * tem balde próprio (decisão do diretor) em vez de sumir da conta.
 */
export const admissaoEmAndamentoSql = sql<boolean>`(${admissoes.farolGlobal} IN ('EM_ADMISSAO', 'BANCO_AGUARDAR') AND ${admissoes.pausadaEm} IS NULL)`;

/**
 * "EM ANDAMENTO" EXCLUSIVO: anda E ainda NÃO concluiu. É o balde que os CARDS usam.
 *
 * POR QUE ELE EXISTE (correção pedida pelo diretor, com a diretoria olhando): os dois baldes leem
 * fontes diferentes, "em andamento" olha o FAROL e "concluída" olha as FRENTES. Uma admissão que
 * fechou o Cadastro enquanto o farol ainda não virou satisfaz OS DOIS, e a MESMA pessoa era contada
 * duas vezes em cards que a tela apresenta como opostos. Eram 56 admissões, 14 delas nascidas numa
 * única noite.
 *
 * CONCLUÍDA MANDA. Entre "terminou" e "está andando", quem terminou não está mais andando: o
 * desfecho é o estado mais forte, e é o que o usuário espera ler.
 *
 * NÃO SUBSTITUI a correção do farol (`esteira.service`, conclusão sem integração), que conserta o
 * dado na origem. Este é o cinto de segurança da LEITURA: enquanto qualquer farol estiver atrasado
 * por qualquer motivo, os cards continuam sem contar ninguém duas vezes.
 */
export const admissaoEmAndamentoExclusivoSql = sql<boolean>`(${admissaoEmAndamentoSql} AND NOT ${admissaoConcluidaSql})`;
