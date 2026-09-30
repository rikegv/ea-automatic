import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a Gestão Das Assinaturas.
 *
 * Reúne os seis artigos desta tela: ler a fila, disparar de um, disparar em lote, cancelar o
 * documento, reenviar por correção e trocar o kit. Os seis tropeçam nas mesmas coisas: o kit que
 * ainda não existe, o cliente sem grupo de assinatura, e a falha de disparo que pode ter criado o
 * envelope mesmo assim.
 *
 * ┌─ O ERRO QUE ESTA FAMÍLIA EXISTE PARA IMPEDIR, E ELE É CARO ──────────────────────────────────┐
 * │ Quando o disparo falha, a resposta certa NÃO é clicar de novo: o envelope pode ter nascido na  │
 * │ Clicksign antes de a resposta voltar, e repetir gera envelope duplicado para a mesma pessoa.   │
 * │ Escrita seis vezes, essa instrução vira seis versões, e a versão errada custa um contrato      │
 * │ duplicado na mão do funcionário. Ela mora aqui uma vez.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const familia: FamiliaDeArtigos = {
  codigo: "assinaturas",
  rotulo: "Gestão Das Assinaturas",
  preRequisitos: [
    "Ter o menu de assinaturas liberado para o seu usuário.",
    "O kit do funcionário já precisa existir e estar anexado. Quem gera o kit é o Gerador De Kit, e ele só nasce depois das três frentes concluídas.",
    "O cliente precisa ter grupo de assinatura da empresa cadastrado, senão o envelope não é disparado.",
  ],
  seDerErrado: [
    {
      sintoma: "A fila não carregou.",
      acao: "Use o recarregar da própria tela. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
    {
      sintoma: "O disparo falhou e você não sabe se o envelope foi criado.",
      acao: "NÃO clique de novo. O envelope pode ter nascido antes de a resposta voltar, e repetir cria um segundo contrato para a mesma pessoa. Recarregue a fila, confira o estado daquele candidato, e só dispare de novo se ele continuar sem envelope.",
    },
    {
      sintoma: "A lista de um recorte está vazia e você esperava gente nela.",
      acao: "Cada recorte da tela conta uma coisa diferente. Confira qual está selecionado antes de concluir que a fila está vazia, e leia a mensagem: ela distingue fila vazia de filtro aplicado.",
    },
    {
      sintoma: "A consulta à Clicksign não respondeu.",
      acao: "É a consulta externa que falhou, e o envelope não foi alterado por isso. Tente de novo em um minuto.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
