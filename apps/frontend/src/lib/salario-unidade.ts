/**
 * A UNIDADE DO SALÁRIO, na tela (OST do salário horista).
 *
 * ┌─ POR QUE EXISTE, e o número que originou a frente ───────────────────────────────────────────┐
 * │ Medido na produção: 7 admissões vivas com salário `9,34` e `10,90`, que são valores de HORA.  │
 * │ O EA não tinha onde declarar a unidade, e o campo correspondente do GI tem default "Mês":     │
 * │ essas 7 entrariam na folha como salário MENSAL de R$ 9,34, em silêncio. A decisão do diretor  │
 * │ foi que o time DECLARA a unidade numa tela, e não que o sistema deduza pela faixa do valor.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SETE OPÇÕES, E NÃO DUAS, e isso é régua, não excesso: com escolha binária o time marca "mensal"
 * quando a verdade é "dia", e o valor errado passa a carregar um selo dizendo que alguém conferiu.
 * Pior do que não ter selo nenhum.
 *
 * O VOCABULÁRIO É O DO EA, nunca a letra do fornecedor: a coluna `dados_vaga_folha.salario_unidade`
 * guarda `HORA`, e quem traduz para o `tipoSalario` (`H`) é o montador do backend
 * (`domain/portal-dados-gi.ts`, `TIPO_SALARIO_GI_POR_UNIDADE`). Letra de fornecedor na tela amarraria
 * a tela ao contrato dele.
 *
 * ESTA LISTA ESPELHA `SALARIO_UNIDADES_EA` do backend, e um teste independente lê o arquivo de lá e
 * prova a igualdade (`salario-unidade.spec.ts`): divergência entre as duas viraria opção que a tela
 * oferece e o servidor recusa, que é pior do que opção faltando.
 *
 * §A.6: aqui só há vocabulário e rótulo. Nenhum valor, nenhum dado pessoal.
 */

/** Os valores canônicos, na MESMA ordem do backend. */
export const SALARIO_UNIDADES = [
  "AULA",
  "COMISSAO",
  "DIA",
  "HORA",
  "MENSAL",
  "QUINZENAL",
  "TAREFA",
] as const;

export type SalarioUnidade = (typeof SALARIO_UNIDADES)[number];

/** Rótulo de cada unidade. §A.24: são TAGS, então vão em title case. §A.11: sem travessão. */
export const ROTULO_SALARIO_UNIDADE: Record<SalarioUnidade, string> = {
  AULA: "Aula",
  COMISSAO: "Comissão",
  DIA: "Dia",
  HORA: "Hora",
  MENSAL: "Mensal",
  QUINZENAL: "Quinzenal",
  TAREFA: "Tarefa",
};

/** As opções prontas para o `Select` do design system (§A.35: nunca o `<select>` nativo). */
export const OPCOES_SALARIO_UNIDADE: { value: string; label: string }[] = SALARIO_UNIDADES.map(
  (u) => ({ value: u, label: ROTULO_SALARIO_UNIDADE[u] }),
);

/** A unidade que exige a jornada junto. Única na lista, e por isso nomeada em vez de comparada solta. */
export const UNIDADE_QUE_EXIGE_JORNADA: SalarioUnidade = "HORA";

/** A jornada só é pedida quando a unidade declarada é `HORA`. */
export function exigeJornada(unidade: string | null | undefined): boolean {
  return unidade === UNIDADE_QUE_EXIGE_JORNADA;
}

/**
 * Os tetos FÍSICOS da jornada, espelhando `TETO_FISICO_JORNADA` do backend (31 × 24 e 7 × 24) e os
 * CHECKs do banco (`ck_dados_vaga_folha_jornada_horas_mes/sem`, migration 0140).
 *
 * São teto do que EXISTE, não régua trabalhista: quem recusa 300 h/mês por ser absurdo é o humano que
 * lê a tela. A tela barra só o impossível, para não discutir com a CLT no lugar de quem opera.
 */
export const TETO_JORNADA = { mes: 744, sem: 168 } as const;

/**
 * JORNADA do payload (`numeric(6,2)`, que o Drizzle devolve como string: "220.00") para o campo, em
 * pt-BR ("220,00"). Mesmo motivo da `salarioParaCampo`: num sistema pt-BR, ponto é separador de
 * milhar, e mostrar "220.00" ensina o time a digitar errado. Valor não numérico volta como veio.
 */
export function jornadaParaCampo(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * MÁSCARA do campo de jornada: dígitos e UMA vírgula decimal, no máximo duas casas. Não é a máscara de
 * centavos do salário de propósito, porque jornada se digita inteira ("220", "44") e a régua de
 * centavos transformaria "220" em "2,20".
 */
export function maskJornada(raw: string): string {
  const limpo = raw.replace(/[^\d,]/g, "");
  const [inteiro, ...resto] = limpo.split(",");
  const corte = inteiro.slice(0, 4);
  if (resto.length === 0) return corte;
  return `${corte},${resto.join("").slice(0, 2)}`;
}

/** Campo de jornada ("220,00") para a forma canônica que o backend aceita ("220.00"). */
export function jornadaParaNumero(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n)) return undefined;
  return n.toFixed(2);
}

/**
 * ══ A RÉGUA DA JORNADA: AS DUAS OU NENHUMA, E NUNCA ZERO ══════════════════════════════════════
 *
 * ┌─ POR QUE UMA SÓ É PIOR DO QUE NENHUMA, e é esta a razão de a tela barrar antes do envio ─────┐
 * │ Preencher só a mensal grava 220 h/mês ao lado de ZERO h/semana no fornecedor. Isso não é campo │
 * │ vazio esperando preenchimento: é uma CONTRADIÇÃO declarada, e o GI a aceita calado. Zero cai   │
 * │ no mesmo buraco por um motivo pior ainda: zero É o default do fornecedor, então zero declarado │
 * │ e zero por omissão ficam indistinguíveis depois de gravados.                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O servidor é a AUTORIDADE e recusa de novo (`GI_SALARIO_HORISTA_SEM_JORNADA`). Isto aqui é UX: dizer
 * o que falta antes do clique, em vez de deixar a recusa aparecer no envio para a folha, que é longe.
 *
 * Devolve a frase pronta, ou `null` quando está tudo certo. §A.11: sem travessão.
 */
export function problemaDaJornada(
  unidade: string | null | undefined,
  horasMes: string,
  horasSem: string,
): string | null {
  if (!exigeJornada(unidade)) return null;
  const mes = jornadaParaNumero(horasMes);
  const sem = jornadaParaNumero(horasSem);
  const temMes = mes !== undefined && Number(mes) > 0;
  const temSem = sem !== undefined && Number(sem) > 0;
  if (!temMes && !temSem) {
    return "Salário por hora exige a jornada em horas. Informe as horas por mês e as horas por semana.";
  }
  if (!temMes) return "Falta a jornada mensal. Informe as horas por mês, senão a folha recebe zero.";
  if (!temSem) {
    return "Falta a jornada semanal. Informe as horas por semana, senão a folha recebe zero.";
  }
  if (Number(mes) > TETO_JORNADA.mes) {
    return `A jornada mensal informada não existe. O máximo é ${TETO_JORNADA.mes} horas no mês.`;
  }
  if (Number(sem) > TETO_JORNADA.sem) {
    return `A jornada semanal informada não existe. O máximo é ${TETO_JORNADA.sem} horas na semana.`;
  }
  return null;
}

/**
 * ══ O QUE IMPEDE SALVAR, E O QUE É SÓ PENDÊNCIA ═══════════════════════════════════════════════
 *
 * ┌─ A LINHA É A REGRA 5 DO DOMÍNIO (NÃO-BLOQUEIO), e ela não cai por causa desta frente ───────┐
 * │ Admissão é criável com obrigatório vazio: o sinalizador marca, nunca impede (§A.3, regra 5).  │
 * │ Então `HORA` com as DUAS horas vazias é PENDÊNCIA: a tela avisa, o selo não nasce, e o envio  │
 * │ para a folha é que recusa (`GI_SALARIO_HORISTA_SEM_JORNADA`). Travar o salvamento aqui faria  │
 * │ esta frente revogar uma regra de domínio sem ninguém ter decidido isso.                       │
 * │                                                                                               │
 * │ O que IMPEDE é o que foi DIGITADO e está errado: uma hora só (contradição declarada), zero    │
 * │ (indistinguível do default do fornecedor) e acima do teto físico (que o CHECK do banco recusa │
 * │ com 400 e uma mensagem de Postgres que ninguém entende). Aí não há pendência a registrar, há  │
 * │ dado inválido a corrigir antes de gravar.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function jornadaImpedeSalvar(
  unidade: string | null | undefined,
  horasMes: string,
  horasSem: string,
): boolean {
  if (!problemaDaJornada(unidade, horasMes, horasSem)) return false;
  return horasMes.trim() !== "" || horasSem.trim() !== "";
}
