"use client";

/**
 * EDITAR E EXCLUIR A VAGA JÁ LIBERADA, do lado da tela (frente do CRUD da vaga liberada).
 *
 * O mapa de alcance, o veto do `seguranca` e as decisões do diretor estão em
 * `docs/MAPA-CRUD-VAGA-LIBERADA.md`. O vocabulário é o do contrato no `shared-types`
 * (`AsVagaEdicaoPrevia`, `AsVagaEdicaoNegada`, `AsVagaExclusaoPrevia`), e nada aqui o redeclara.
 *
 * A AUTORIDADE É DO SERVIDOR: a prévia existe para a tela não oferecer o que seria recusado e para
 * dizer por quê. Quem recusa de verdade é a rota de edição e a de exclusão.
 *
 * §A.6: aqui transitam vaga, ids de usuário e contagens. Nenhum dado de candidato.
 * §A.11 (sem travessão), §A.24 (as frases são texto de apoio, escrita normal).
 */

import {
  AS_VAGA_CAMPOS_NUNCA_EDITAVEIS,
  AS_VAGA_EDICAO_RECUSAS,
  type AsVagaCampoDaAdmissao,
  type AsVagaEdicaoConfirmacoes,
  type AsVagaEdicaoNegada,
  type AsVagaEdicaoPrevia,
  type AsVagaEdicaoResultado,
  type AsVagaExclusaoPrevia,
} from "@ea/shared-types";
import { ApiError, apiFetch } from "@/lib/api";

// ── AS PORTAS DA REDE ──────────────────────────────────────────────────────

/** O que a edição pode fazer nesta vaga, lido ao abrir o formulário. */
export function edicaoPrevia(id: string, token?: string | null): Promise<AsVagaEdicaoPrevia> {
  return apiFetch<AsVagaEdicaoPrevia>(`/as/vagas/${id}/edicao-previa`, { token });
}

/** Grava a edição. O 409 com `codigo` é tratado por `recusaDaEdicao`. */
export function editarVaga(
  id: string,
  corpo: Record<string, unknown> & AsVagaEdicaoConfirmacoes,
  token?: string | null,
): Promise<AsVagaEdicaoResultado> {
  return apiFetch<AsVagaEdicaoResultado>(`/as/vagas/${id}/editar`, {
    method: "PATCH",
    token,
    body: corpo,
  });
}

/** O que o modal de exclusão precisa saber antes de o Super Admin confirmar. */
export function exclusaoPrevia(id: string, token?: string | null): Promise<AsVagaExclusaoPrevia> {
  return apiFetch<AsVagaExclusaoPrevia>(`/as/vagas/${id}/exclusao-previa`, { token });
}

export function excluirVaga(id: string, token?: string | null): Promise<unknown> {
  return apiFetch(`/as/vagas/${id}`, { method: "DELETE", token });
}

/**
 * OS RESPONSÁVEIS QUE PODEM SER ESCOLHIDOS. Consultores pelo mesmo endpoint da transferência de
 * consultor; recrutadores pelo endpoint irmão, que devolve quem tem o papel de A&S do outro lado.
 */
export function carregarConsultores(token?: string | null): Promise<{ id: string; nome: string }[]> {
  return apiFetch<{ id: string; nome: string }[]>("/as/vagas/consultores", { token });
}

export function carregarRecrutadores(token?: string | null): Promise<{ id: string; nome: string }[]> {
  return apiFetch<{ id: string; nome: string }[]>("/as/vagas/recrutadores", { token });
}

// ── QUEM VÊ O QUÊ ──────────────────────────────────────────────────────────

/**
 * O "EXCLUIR VAGA" SÓ APARECE PARA O SUPER_ADMIN (decisão do diretor: o Master não exclui). É só a
 * tela não oferecer o clique; quem recusa é o `@Roles("SUPER_ADMIN")` do DELETE.
 */
export function podeExcluirVagaPeloPapel(papel: string | null | undefined): boolean {
  return papel === "SUPER_ADMIN";
}

// ── O 409 DA EDIÇÃO ────────────────────────────────────────────────────────

/**
 * A RECUSA DA EDIÇÃO, reconhecida pelo CORPO e não pela frase.
 *
 * O `codigo` é conferido contra a lista fechada do contrato: um 409 de outra origem (corrida com o
 * fechamento, por exemplo) não vira pedido de confirmação por engano. A frase vem em `mensagem`, e
 * o `ApiError.message` é só o fallback, porque o cliente HTTP lê `message` e o contrato fala
 * `mensagem`.
 */
export function recusaDaEdicao(err: unknown): AsVagaEdicaoNegada | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<AsVagaEdicaoNegada> | undefined;
  if (!corpo || typeof corpo.codigo !== "string") return null;
  if (!(AS_VAGA_EDICAO_RECUSAS as readonly string[]).includes(corpo.codigo)) return null;
  return {
    ...corpo,
    codigo: corpo.codigo,
    mensagem:
      typeof corpo.mensagem === "string" && corpo.mensagem ? corpo.mensagem : err.message,
  } as AsVagaEdicaoNegada;
}

/** Os dois códigos que não são erro: são o pedido de confirmação, e a tela reenvia com a flag. */
export function ehPedidoDeConfirmacao(n: AsVagaEdicaoNegada): boolean {
  return n.codigo === "CONFIRMAR_TROCA_DE_CLIENTE" || n.codigo === "CONFIRMAR_ABAIXO_DO_ALOCADO";
}

/** As confirmações do próximo envio: as que já foram dadas mais a que a recusa acabou de pedir. */
export function confirmacoesDepoisDe(
  anteriores: AsVagaEdicaoConfirmacoes,
  n: AsVagaEdicaoNegada,
): AsVagaEdicaoConfirmacoes {
  if (n.codigo === "CONFIRMAR_TROCA_DE_CLIENTE") {
    return { ...anteriores, confirmarTrocaDeCliente: true };
  }
  if (n.codigo === "CONFIRMAR_ABAIXO_DO_ALOCADO") {
    return { ...anteriores, confirmarAbaixoDoAlocado: true };
  }
  return anteriores;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** O título e a frase do diálogo de confirmação. Título é title case (§A.24). */
export function textoDaConfirmacao(n: AsVagaEdicaoNegada): {
  titulo: string;
  frase: string;
  botao: string;
} {
  if (n.codigo === "CONFIRMAR_TROCA_DE_CLIENTE") {
    const entrevistas = n.entrevistas ?? 0;
    return {
      titulo: "Trocar O Cliente Da Vaga?",
      frase:
        entrevistas > 0
          ? `Trocar o cliente apaga ${plural(entrevistas, "entrevista marcada", "entrevistas marcadas")} com o cliente anterior. A troca e a remoção ficam registradas na trilha da vaga.`
          : "A troca de cliente fica registrada na trilha da vaga.",
      botao: "Trocar cliente",
    };
  }
  const alocados = n.alocados ?? 0;
  const entregues = n.entregues ?? 0;
  return {
    titulo: "Posições Abaixo Do Alocado",
    frase: `A vaga já tem ${plural(alocados, "pessoa alocada", "pessoas alocadas")} e ${plural(entregues, "entregue", "entregues")}. Reduzir as posições abaixo do alocado deixa gente alocada além da meta. A redução fica registrada na trilha da vaga.`,
    botao: "Reduzir assim mesmo",
  };
}

// ── A FRONTEIRA A&S / ADM (decisão 3) ─────────────────────────────────────

/** O aviso do topo do formulário quando a vaga já mandou gente para a admissão. Vazio quando não. */
export function avisoDaFronteiraDaAdmissao(previa: AsVagaEdicaoPrevia | null): string {
  if (!previa || previa.camposTravadosPelaAdmissao.length === 0) return "";
  const n = previa.enviadosParaAdmissao;
  return `Esta vaga já mandou ${plural(n, "pessoa", "pessoas")} para a admissão. Cliente, cargo, salário, escala, tempo de contrato, motivo, substituído e local de trabalho agora são do time de ADM, e se alteram na tela da admissão.`;
}

/** O conjunto dos campos travados, para a pergunta "este controle é de leitura?". */
export function travadosDaPrevia(
  previa: AsVagaEdicaoPrevia | null,
): ReadonlySet<AsVagaCampoDaAdmissao> {
  return new Set(previa?.camposTravadosPelaAdmissao ?? []);
}

/**
 * ─ O CORPO DA EDIÇÃO, A PARTIR DO CORPO QUE A TRILHA JÁ MONTA ───────────────────────────────────
 *
 * TRÊS AJUSTES, e só eles:
 *  1. SAEM os campos que a edição nunca escreve (`AS_VAGA_CAMPOS_NUNCA_EDITAVEIS`), inclusive o
 *     `contraparteId`, que dá lugar a `consultorId` e `recruiterId`;
 *  2. SAEM os campos travados pela admissão: ausente é "fica como está", e mandar o valor de volta
 *     arriscaria uma diferença de formato (máscara de salário, de CPF) lida como alteração;
 *  3. CAMPO ESVAZIADO VIAJA COMO `null`, e não ausente. A edição é "vaga atual + campos enviados":
 *     ausente manteria o valor antigo, e a pessoa que apagou as observações veria o texto voltar. As
 *     posições são a exceção (vazio nunca zera a meta), e continuam ausentes quando em branco.
 */
const NUNCA_VIRA_NULO = new Set(["posicoesOficiais", "posicoesBanco"]);

export function corpoDaEdicao(
  corpoDaTrilha: Record<string, unknown>,
  travados: ReadonlySet<string>,
  responsaveis: { consultorId: string; recruiterId: string },
  confirmacoes: AsVagaEdicaoConfirmacoes,
): Record<string, unknown> {
  const fora = new Set<string>([...AS_VAGA_CAMPOS_NUNCA_EDITAVEIS, ...travados]);
  const corpo: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(corpoDaTrilha)) {
    if (fora.has(campo)) continue;
    if (valor === undefined) {
      if (!NUNCA_VIRA_NULO.has(campo)) corpo[campo] = null;
      continue;
    }
    corpo[campo] = valor;
  }
  corpo.consultorId = responsaveis.consultorId || null;
  corpo.recruiterId = responsaveis.recruiterId || null;
  if (confirmacoes.confirmarTrocaDeCliente) corpo.confirmarTrocaDeCliente = true;
  if (confirmacoes.confirmarAbaixoDoAlocado) corpo.confirmarAbaixoDoAlocado = true;
  return corpo;
}

// ── AS LISTAS DE CONSULTOR E DE RECRUTADOR ────────────────────────────────

type Pessoa = { id: string; nome: string };

/** Garante que o responsável atual aparece na lista, mesmo inativo ou fora do catálogo. */
function comAtual(lista: Pessoa[], atualId: string | null, atualNome: string | null): Pessoa[] {
  if (!atualId || lista.some((p) => p.id === atualId)) return lista;
  return [{ id: atualId, nome: atualNome ?? "Responsável atual" }, ...lista];
}

export function consultoresDaEdicao(
  consultores: Pessoa[],
  atualId: string | null,
  atualNome: string | null,
): Pessoa[] {
  return comAtual(consultores, atualId, atualNome);
}

/** OS RECRUTADORES, pela rota própria; o atual entra mesmo fora da lista (ex. inativado). */
export function recrutadoresDaEdicao(
  recrutadores: Pessoa[],
  atualId: string | null,
  atualNome: string | null,
): Pessoa[] {
  return comAtual(recrutadores, atualId, atualNome);
}
