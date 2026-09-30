import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o Gerador De Kit.
 *
 * Reúne os quatro artigos desta tela: processar o kit a partir dos arquivos da folha, baixar o kit
 * de um funcionário, reimportar o que faltou e enviar para assinatura. Os quatro tropeçam nas
 * mesmas coisas: o tipo de vínculo que não foi escolhido, o funcionário que não foi vinculado, e o
 * arquivo que é TEMPORÁRIO.
 *
 * ┌─ O QUE MAIS GERA CHAMADO NESTA TELA, E POR ISSO MORA AQUI ───────────────────────────────────┐
 * │ Os arquivos do kit não ficam guardados: eles existem por uma janela curta e somem. Quem deixa  │
 * │ para baixar depois perde, e precisa processar de novo. Dito uma vez, em todos os quatro.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const familia: FamiliaDeArtigos = {
  codigo: "gerador-kit",
  rotulo: "Gerador De Kit",
  preRequisitos: [
    "Ter o menu do Gerador De Kit liberado para o seu usuário.",
    "O arquivo que vem do sistema de folha já precisa estar salvo no seu computador, em PDF.",
    "As três frentes da admissão já precisam estar concluídas: o kit não nasce antes disso.",
  ],
  seDerErrado: [
    {
      sintoma: "O sistema não deixa processar e pede o tipo de vínculo.",
      acao: "O seletor de kit não foi escolhido. Escolha o tipo de vínculo antes de processar: é ele que define quais documentos entram.",
    },
    {
      sintoma: "O sistema pede a admissão ou o funcionário.",
      acao: "O arquivo foi lido mas não foi vinculado a ninguém. Busque o funcionário pelo nome e escolha a admissão dele antes de seguir.",
    },
    {
      sintoma: "O arquivo baixou e depois deixou de baixar.",
      acao: "Os arquivos do kit são temporários e expiram. Processe de novo e baixe na hora, sem deixar para depois.",
    },
    {
      sintoma: "A tela avisa que o arquivo não trouxe documentos novos para aquele funcionário.",
      acao: "O arquivo não tinha página daquela pessoa, ou ela já estava completa. Confira o bloco do que não foi reconhecido antes de subir outro arquivo.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
