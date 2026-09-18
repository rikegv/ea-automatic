"use client";

import type { VagaListItem } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/**
 * ─ A FILA DE VAGAS PENDENTES DE REVISÃO, DO LADO DA TELA ───────────────────────────────────────
 *
 * O QUE É ESTA FILA. A varredura do Pandapé espelha, dentro do EA, vagas que NINGUÉM abriu aqui.
 * Elas nascem no status `PENDENTE_REVISAO` (papel `REVISAO`) e com o `cod_cliente` NULO, porque o
 * cliente NÃO TEM CAMINHO NA API do ATS (medido). A vaga fica viva, recebe as candidaturas que a
 * ingestão leu, e espera uma pessoa fazer duas coisas: vincular o cliente que falta e liberar.
 *
 * ┌─ A TRAVA DE VERDADE É DO SERVIDOR, E A DAQUI É O AVISO ────────────────────────────────────┐
 * │ `podeLiberar` existe para a tela não OFERECER um clique que o backend recusaria, e para     │
 * │ dizer POR QUE ele não está disponível. Ela não é a autorização: uma guarda só de frontend é │
 * │ contornável pela rota, e a casa já registrou esse erro antes. As duas existem, e cada uma   │
 * │ faz uma coisa: o servidor recusa, a tela explica.                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ NÃO EXISTE LOTE AQUI, E A AUSÊNCIA É DELIBERADA ─────────────────────────────────────────────
 * A auditoria de segurança vetou a liberação em lote: um cliente errado aplicado a 600 vagas
 * atribuiria centenas de pessoas ao controlador errado, de uma vez, sem ninguém olhar linha por
 * linha. A liberação é UMA VAGA POR VEZ, e este módulo não serve função de lote nenhuma.
 *
 * §A.6: aqui só transitam vaga, cliente e cargo. Nenhum dado pessoal de candidato.
 */

/**
 * A LINHA DA FILA É O `VagaListItem`, O MESMO DTO DA CENTRAL DE VAGAS, e isso é escolha de contrato,
 * não preguiça: um recorte próprio criaria um segundo formato da mesma vaga, que envelhece sozinho e
 * discorda do primeiro no dia em que um campo mudar. A fila é uma LISTA DE VAGAS, então ela fala a
 * língua que o sistema já usa para listar vaga.
 */
export type VagaEmRevisao = VagaListItem;

/** O que a tela precisa saber para desenhar o botão de liberar: se pode, e por que não. */
export interface ReguaDeLiberacao {
  pode: boolean;
  /** Texto de apoio (§A.24: escrita normal). Vazio quando pode liberar. */
  motivo: string;
}

/**
 * ─ PODE LIBERAR ESTA VAGA? ─────────────────────────────────────────────────────────────────────
 *
 * UMA CONDIÇÃO SÓ, e ela é a razão de a fila existir: a vaga precisa ter CLIENTE. Sem cliente, a
 * vaga liberada entraria na Central de Vagas como uma vaga qualquer, sem se saber para quem aquele
 * processo seletivo trabalha, e as pessoas que ela já carrega ficariam penduradas num processo sem
 * controlador definido.
 *
 * A FRASE DIZ O QUE FAZER, e não só o que está errado: quem lê a recusa precisa saber que o
 * caminho é escolher o cliente ali mesmo, no seletor da própria linha.
 */
export function reguaDeLiberacao(v: Pick<VagaEmRevisao, "codCliente">): ReguaDeLiberacao {
  if (!v.codCliente) {
    return {
      pode: false,
      motivo: "Vincule o cliente antes de liberar. A vaga veio do Pandapé sem cliente, e sem ele não dá para saber a quem o processo seletivo pertence.",
    };
  }
  return { pode: true, motivo: "" };
}

// ── AS PORTAS DA REDE ──────────────────────────────────────────────────────

/**
 * A FILA INTEIRA. Servida pelo backend já recortada pelo papel `REVISAO`, e não filtrada aqui: quem
 * decide o que é pendente de revisão é o catálogo, no servidor, que é o mesmo lugar que a trava da
 * liberação consulta. Filtrar na tela criaria a segunda régua, e a segunda régua é como duas
 * superfícies passam a dizer números diferentes da mesma fila.
 */
export function carregarFilaDeRevisao(token?: string | null): Promise<VagaEmRevisao[]> {
  return apiFetch<VagaEmRevisao[]>("/as/vagas/pendentes-revisao", { token });
}

/**
 * AS VAGAS QUE JÁ SAÍRAM DA FILA pela liberação, que é o alvo da correção do Master. Elas não estão
 * mais pendentes (a fila é o próprio estado), então precisam de leitura própria: sem ela, corrigir
 * uma liberação errada exigiria caçar a vaga no meio da Central de Vagas inteira.
 */
export function carregarLiberadasDaRevisao(token?: string | null): Promise<VagaEmRevisao[]> {
  return apiFetch<VagaEmRevisao[]>("/as/vagas/pendentes-revisao/liberadas", { token });
}

/** Quantas esperam revisão. Molde do contador da Liberação Admissional. */
export function contarPendentesDeRevisao(token?: string | null): Promise<number> {
  return apiFetch<{ count: number }>("/as/vagas/pendentes-revisao/contagem", { token }).then(
    (r) => r.count,
  );
}

/**
 * VINCULAR O CLIENTE E LIBERAR, NUMA CHAMADA SÓ, e o "numa chamada só" é o ponto: fossem duas
 * (grava o cliente, depois libera), a falha da segunda deixaria a vaga com cliente e ainda na fila,
 * e a retentativa teria de adivinhar em que metade parou. O servidor resolve o código do papel
 * `ABERTURA` pelo catálogo; a tela nunca manda código de status nenhum.
 */
export function liberarVagaPendenteRevisao(
  id: string,
  codCliente: string,
  token?: string | null,
): Promise<void> {
  return apiFetch<void>(`/as/vagas/${id}/liberar-revisao`, {
    method: "POST",
    body: { codCliente },
    token,
  });
}

/** O que a correção do Master pode mudar: o cliente, a volta para a fila, ou as duas coisas. */
export interface CorrecaoDaRevisao {
  /** O cliente certo. Vai sempre, inclusive quando é o mesmo, para o servidor não ter de adivinhar. */
  codCliente: string;
  /** Devolver a vaga para a fila de revisão, em vez de só acertar o cliente. */
  devolverParaFila: boolean;
}

/**
 * ─ A CORREÇÃO DO MASTER ────────────────────────────────────────────────────────────────────────
 *
 * UMA PORTA SÓ PARA OS DOIS GESTOS, e eles andam juntos na vida real: quem descobre que liberou com
 * o cliente errado quer trocar o cliente, e às vezes quer a vaga de volta na fila para alguém
 * conferir o resto. Duas rotas separadas obrigariam a tela a chamar as duas em sequência para o caso
 * mais comum, com a mesma fresta de falha no meio da liberação.
 *
 * O `@Roles` É DO SERVIDOR. A tela esconde o gesto de quem não é Master porque oferecer o que o
 * backend vai recusar vira chamado, não porque esconder proteja alguma coisa.
 */
export function corrigirLiberacaoDeRevisao(
  id: string,
  correcao: CorrecaoDaRevisao,
  token?: string | null,
): Promise<void> {
  return apiFetch<void>(`/as/vagas/${id}/corrigir-revisao`, {
    method: "POST",
    body: { ...correcao },
    token,
  });
}
