import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a Central De Vagas, a lista e o ciclo de vida da vaga.
 *
 * Reúne os artigos que trabalham a VAGA como objeto: ler a lista, abrir o painel, enviar a
 * shortlist, fechar, tratar os pendentes, cancelar, reabrir, mover o status, editar as posições,
 * continuar um rascunho e clonar. Todos começam no MESMO lugar (a tabela de `/as/vagas`) e tropeçam
 * nas MESMAS coisas: o menu não liberado, a lista que abriu recortada por um card aceso, e o gesto
 * que não está na barra porque o status da vaga não o permite.
 *
 * ┌─ O QUE NÃO ENTRA AQUI, e o critério é o mesmo da família do Gerenciador ─────────────────────┐
 * │ Erro que só acontece em UM caminho fica no artigo dele. A trava da vaga cheia, por exemplo,   │
 * │ só aparece para quem FINALIZA posição, então ela é da família do funil, não daqui. E o que    │
 * │ já é artigo de padrão do sistema (filtrar, ordenar, buscar, card como filtro, paginar) não    │
 * │ entra em família nenhuma: o artigo referencia em `relacionados` e não reexplica.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As mensagens de falha são as que o código escreve, letra por letra ("Não foi possível abrir a
 * vaga. Tente de novo.", `app/(app)/as/vagas/page.tsx`), e não uma paráfrase: é por ela que a
 * pessoa procura.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "as-vagas",
  rotulo: "Central De Vagas",
  preRequisitos: [
    "Ter o menu Central De Vagas liberado para o seu usuário.",
    "A vaga já precisa estar publicada. Rascunho fica guardado na lista e não entra na fila de trabalho.",
  ],
  seDerErrado: [
    {
      sintoma: "A Central De Vagas não aparece no menu da lateral esquerda.",
      acao: "Quem libera menu por usuário é a diretoria. Peça a liberação do menu Central De Vagas, sem ele a tela responde acesso negado mesmo com o endereço na mão.",
    },
    {
      sintoma: "A lista abriu com muito menos vaga do que você esperava.",
      acao: "A tela guarda o recorte enquanto você trabalha. Confira qual card do topo está aceso, porque o card também é filtro, e use o Limpar filtro ao lado da busca.",
    },
    {
      sintoma: "O gesto que você procura não está na barra da vaga.",
      acao: "A barra mostra só o que o status atual permite. Vaga fechada ou cancelada não recebe os gestos de vaga viva, e vaga em rascunho só oferece continuar e publicar. Confira a pill de status da linha.",
    },
    {
      sintoma: "A tela mostra Não foi possível abrir a vaga. Tente de novo.",
      acao: "A leitura daquela vaga não voltou. Clique de novo. Se repetir, recarregue a página e confira se a sua sessão continua aberta.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
