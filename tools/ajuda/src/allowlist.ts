/**
 * ─ A ALLOWLIST QUE O MOTOR ENTREGA AO GATE ─────────────────────────────────────────────────────
 *
 * Três parcelas, e cada uma existe por um motivo diferente:
 *
 * 1. AS MÁSCARAS DA PRÓPRIA INTERFACE, MEDIDAS NO CÓDIGO (`grep placeholder=` em
 *    `apps/frontend/src`). Elas violam a régua literal do gate (o CPF de máscara é prefixo 000,
 *    `email@soulan.com.br` não termina em `.invalid`, `Maria Souza` é nome de pessoa em forma
 *    perfeita) e não são dado de ninguém: são o que Nova Admissão, Sala De Espera, Assinante Da
 *    Empresa e o Portal já mostram hoje. Sem declará-las, um gate CORRETO recusa toda tela com
 *    formulário, que é metade do manual. A exceção é LITERAL, valor a valor: `000.000.000-01`
 *    continua recusado.
 *
 * 2. OS NOMES DOS **CANDIDATOS** DA BASE DE HOMOLOGAÇÃO, e SÓ deles. Eles só entram DEPOIS de a
 *    asserção de população aprovar, e é essa ordem que os torna seguros: aprovada a base, todo nome
 *    de candidato é sintético por prova, não por suposição. Invertida a ordem, a allowlist passaria a
 *    autorizar exatamente o que deveria barrar.
 *
 *    OS **USUÁRIOS** NÃO ENTRAM AQUI, e isso é a correção de premissa de 27/09/2026. Eles são REAIS
 *    (é o time do diretor testando) e PERMANECEM na base, então somá-los à allowlist, como se fazia,
 *    autorizava o nome e o e-mail corporativo de cada colega a aparecer em print. O lugar deles é a
 *    DENYLIST (`NegadosDeEquipe` em `pii.ts`), montada da tabela `usuarios` pela asserção de
 *    arranque: o que o gate PROCURA, não o que ele permite.
 *
 * 3. O QUE O ARNÊS DECLARAR (`tools/ajuda/allowlist-arnes.json`, gerado pelo arnês do manual).
 *    Ausente, nada é declarado: fail-closed também aqui.
 *
 * ┌─ **COLUNA DE PESSOA NUNCA ENTRA NESTA ALLOWLIST** (rota fechada por escrito, `seguranca`) ─────┐
 * │ Vale para `sala_espera`, `as_candidatos`, `dados_vaga_folha.motivo`, `gestor_bp` e qualquer outra │
 * │ `ColunaDePessoa` de `lote.ts`. A tentação é real e tem uma justificativa que SOA boa: aquelas       │
 * │ fontes foram LIBERADAS pelo diretor em 28/09/2026, então "já que o dado pode aparecer, declare-o    │
 * │ e pare de discutir". A cadeia abaixo é o motivo de isso ser PERIGOSO, e ela é de código, não de     │
 * │ opinião:                                                                                         │
 * │                                                                                                │
 * │   `bin/capturar.ts` monta a allowlist FINAL (máscaras + candidatos + declaração do arnês) e a      │
 * │   passa a `remontarProtecao(leitor, allowlist, negados)` -> `protecao-por-roteiro.ts` ->          │
 * │   `montarNegadosDeEquipe(usuarios, allow)`, que usa a allowlist como **SUBTRAÇÃO DA DENYLIST**.    │
 * │                                                                                                │
 * │ Ou seja: um valor declarado aqui não só passa a ser PERMITIDO, ele **REMOVE da proteção** o colega │
 * │ do time cujo nome seja igual a ele. Um homônimo entre a sala de espera e a tabela `usuarios` tira  │
 * │ aquele colega da denylist EM SILÊNCIO, e o print sai com o nome dele e o gate aprova. O sintoma é  │
 * │ zero, que é o modo de falha desta frente inteira.                                                │
 * │                                                                                                │
 * │ A régua, então: liberar dado de candidato se resolve em `REGUA_DAS_COLUNAS_DE_PESSOA` (a fonte      │
 * │ `LIBERADA` sai do circuito inteiro, e por isso o `continue` dela vem ANTES da consulta), NUNCA      │
 * │ pela porta da allowlist. E o item 2 acima continua sendo o ÚNICO conteúdo de base que entra aqui:   │
 * │ os CANDIDATOS, e só depois de a asserção de população provar que eles são sintéticos.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { AllowlistArnes } from "../../../apps/frontend/src/ajuda/pii";
import type { LinhaPessoa } from "../../../apps/frontend/src/ajuda/lote";

/**
 * ─ POR QUE AS MÁSCARAS MORAM AQUI, E NÃO NA DECLARAÇÃO DO ARNÊS (decisão do coordenador) ────────
 *
 * Elas são propriedade da INTERFACE do sistema, não dado de teste: `000.000.000-00` e `Maria Souza`
 * estão no `placeholder` das telas de produção, e continuariam lá se o arnês nunca existisse.
 * Misturá-las com o que o arnês criou faria parecer que ALGUÉM AS CADASTROU, e a leitura errada tem
 * consequência: quem for limpar o dado de teste iria procurá-las no banco, não as acharia, e no
 * limite as removeria da allowlist, derrubando o gate em toda tela com formulário.
 *
 * MEDIDAS no código de produção (`grep placeholder=` em `apps/frontend/src`), não supostas. Dez
 * valores, e a lista é LITERAL: `000.000.000-01` continua recusado.
 */
export const MASCARAS_DA_INTERFACE = [
  "000.000.000-00",
  "(11) 90000-0000",
  "(11) 99999-0000",
  "00000-000",
  "Maria Souza",
  "maria@exemplo.com",
  "nome@email.com",
  "voce@empresa.com",
  "email@soulan.com.br",
  "seu.email@soulan.com.br",
];

export type DeclaracaoDoArnes = Partial<AllowlistArnes>;

export function montarAllowlist(
  /** SÓ CANDIDATOS (ver o item 2 do bloco acima). Usuário real nunca entra em allowlist. */
  pessoas: LinhaPessoa[],
  arnes: DeclaracaoDoArnes = {},
): AllowlistArnes {
  const nomes = [...new Set(pessoas.map((p) => p.nome).filter(Boolean) as string[])];
  const cpfs = [...new Set(pessoas.map((p) => p.cpf).filter(Boolean) as string[])];
  const emails = [...new Set(pessoas.map((p) => p.email).filter(Boolean) as string[])];
  return {
    nomes: [...nomes, ...(arnes.nomes ?? [])],
    cpfs: [...cpfs, ...(arnes.cpfs ?? [])],
    emails: [...emails, ...(arnes.emails ?? [])],
    telefones: arnes.telefones ?? [],
    datasNascimento: arnes.datasNascimento ?? [],
    enderecos: arnes.enderecos ?? [],
    salarios: arnes.salarios ?? [],
    contasBancarias: arnes.contasBancarias ?? [],
    matriculas: arnes.matriculas ?? [],
    /**
     * ─ OS DOIS FIOS QUE ESTAVAM CORTADOS (conserto de fiação, rodada 4) ──────────────────────────
     *
     * `senhas` e `gestores` eram DECLARÁVEIS em `AllowlistArnes` e simplesmente NÃO CHEGAVAM ao gate:
     * o arnês podia escrevê-los em `allowlist-arnes.json`, o typecheck passava, o teste passava, e a
     * declaração morria nesta função. É a MESMA classe de defeito que esta frente já expôs três vezes
     * (dado declarado de um lado e nunca consumido do outro, com tudo verde), e é a mais difícil de
     * ver justamente porque nada falha.
     *
     * A régua de cada um continua a de sempre: SENHA REAL e GESTOR REAL não entram aqui, só o que o
     * arnês CRIOU. O que muda é que agora a declaração tem efeito.
     */
    senhas: arnes.senhas ?? [],
    gestores: arnes.gestores ?? [],
    mascaras: [...MASCARAS_DA_INTERFACE, ...(arnes.mascaras ?? [])],
  };
}
