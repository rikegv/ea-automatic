import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a Central De Candidatos e a fila de liberação de vaga.
 *
 * Reúne os artigos que trabalham a PESSOA antes e fora de uma vaga específica: ler a lista,
 * cadastrar, importar de planilha, adicionar a uma vaga, ler a ficha, registrar contato, trocar de
 * vaga, trazer de volta, e a fila de vaga pendente de revisão. Todos tropeçam nas MESMAS coisas: o
 * escopo Em Andamento contra Histórico, o corte da lista quando há mais gente do que a página, e a
 * pessoa sem CPF.
 *
 * ┌─ O ESCOPO É A CAUSA NÚMERO UM DE "SUMIU" NESTA TELA ─────────────────────────────────────────┐
 * │ Quem recebeu desfecho (aprovado, alocado, enviado para admissão, descartado, desistiu) sai da │
 * │ visão padrão e mora no Histórico. Quem procura a pessoa em Em Andamento não a encontra e       │
 * │ conclui que ela foi apagada. É o mesmo mal-entendido em todos os artigos da família, então a   │
 * │ resposta mora aqui uma vez.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As frases são as que o código escreve, letra por letra: "Falha ao carregar a Central de
 * Candidatos." sai de `app/(app)/as/candidatos/page.tsx`, e o aviso do corte sai de `avisoDeCorte`,
 * em `lib/as-candidatos.ts`.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "as-candidatos",
  rotulo: "Central De Candidatos",
  preRequisitos: [
    "Ter o menu Central De Candidatos liberado para o seu usuário.",
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa que você procura não aparece na lista.",
      acao: "Confira o escopo no topo. Em Andamento mostra só a frente de trabalho, e quem já recebeu desfecho fica no Histórico. Troque para Histórico antes de concluir que a pessoa não existe.",
    },
    {
      sintoma:
        "A tela avisa que está mostrando parte dos candidatos e o resto não aparece.",
      acao: "A lista tem página, e o aviso diz quantos de quantos você está vendo. Use a busca por nome, ou a busca por CPF, para chegar em quem não está na página.",
    },
    {
      sintoma: "Troquei de escopo e o card que eu tinha aceso deixou de valer.",
      acao: "É assim de propósito: os cards contam gente dentro do escopo atual, então trocar de escopo zera o card aceso. Escolha o escopo primeiro e o card depois.",
    },
    {
      sintoma: "A pessoa não tem CPF e o sistema não deixa seguir.",
      acao: "Candidato sem CPF existe na base e é alocável, mas só pelo caminho que identifica por nome. O CPF é exigido mais adiante, quando a candidatura vira admissão.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar a Central de Candidatos.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
