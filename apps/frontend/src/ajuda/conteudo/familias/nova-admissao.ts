import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "nova-admissao": o bloco comum dos artigos do wizard de Nova Admissão.
 *
 * ┌─ O CRITÉRIO DO QUE ENTRA, E ELE É O DA TELA, NUNCA O DO PASSO ───────────────────────────────┐
 * │ Entra o que vale para QUALQUER um dos três caminhos do wizard: o menu, a ordem das três etapas │
 * │ e os tropeços que a tela dá antes de qualquer decisão de conteúdo (cliente que não aparece na  │
 * │ busca, cargo travado por falta de régua, Próximo apagado, rascunho que não existe).            │
 * │                                                                                                │
 * │ NÃO entra o que é de UM caminho só. O cartão "CPF já cadastrado" é do artigo de reaproveitar, e │
 * │ a janela "Criar Com Pendências Obrigatórias?" é do artigo de salvar com campo vazio: subir os   │
 * │ dois para cá faria os três artigos herdarem um erro que dois deles nem conseguem produzir.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO TRÊS ARTIGOS N1 HOJE, e serão mais quando os N2 do wizard entrarem, então cada linha aqui é
 * uma linha que deixa de ser copiada e de divergir. §A.11: nenhum travessão. §A.6: nenhum dado de
 * pessoa, só rótulos de campo.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "nova-admissao",
  rotulo: "Nova Admissão",
  preRequisitos: [
    "Ter o menu Nova Admissão liberado para o seu usuário.",
    "Saber o cliente e o cargo da vaga. O cadastro anda em três etapas e nenhuma delas é pulável: Cliente, depois Vaga / Cargo, depois Candidato.",
    "Ter o CPF do candidato em mãos. Ele é a identidade da pessoa no sistema, e o dígito é conferido enquanto você digita.",
  ],
  seDerErrado: [
    {
      sintoma: "Nova Admissão não aparece no menu da lateral esquerda.",
      acao: "Quem libera menu por usuário é a diretoria. Peça a liberação do menu Nova Admissão, sem ele a tela responde acesso negado mesmo com o endereço na mão.",
    },
    {
      sintoma: "O cliente não aparece na busca da primeira etapa.",
      acao: "A busca aceita razão social, CNPJ, nome de operação e código, e procura enquanto você digita. Tente por outro desses. Continuando sem aparecer, o cliente não está cadastrado: peça o cadastro à administração antes de seguir.",
    },
    {
      sintoma: "O seletor de cargo está travado, escrito Cadastre a régua do cliente primeiro.",
      acao: "Este cliente não tem régua documental cadastrada, e é a régua que diz quais documentos serão exigidos. Peça o cadastro dela no menu Régua de Documentos. A lista de cargos é por cliente, nunca o catálogo inteiro.",
    },
    {
      sintoma: "O botão Próximo está apagado.",
      acao: "Na etapa Cliente ele espera um cliente escolhido. Na etapa Vaga / Cargo ele espera o cargo e o valor dos benefícios que exigem valor. Preenchido o que falta, ele acende sozinho.",
    },
    {
      sintoma: "Troquei o cliente e o cargo que eu já tinha escolhido sumiu.",
      acao: "É de propósito. Os cargos e a régua são do cliente, então trocar o cliente zera o cargo e o checklist para você não levar a régua de um cliente para outro.",
    },
    {
      sintoma: "Saí da tela no meio e perdi o que tinha digitado.",
      acao: "O wizard não guarda rascunho: a admissão só passa a existir no Confirmar admissão, na última etapa. Antes disso, sair é recomeçar.",
    },
  ],
};
