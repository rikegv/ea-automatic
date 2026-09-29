import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "portal": o bloco comum dos artigos do Gerenciador Do Portal, o lado do TIME.
 *
 * ┌─ A DISTINÇÃO QUE PRECISA VIR ANTES DE QUALQUER PASSO ────────────────────────────────────────┐
 * │ Existem DUAS telas com a palavra portal, e elas são de gente diferente: a que o CANDIDATO abre  │
 * │ pelo link no celular, e ESTA, o painel autenticado em que o time emite o link, acompanha o funil │
 * │ e vê onde cada pessoa está. Quem lê um passo a passo sem essa frase procura aqui o botão de      │
 * │ enviar documento, que é do outro lado. Por isso a distinção é pré-requisito.                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PAINEL NÃO SE ATUALIZA SOZINHO, E ISSO É CONDIÇÃO, NÃO DESCUIDO ─────────────────────────┐
 * │ O limite de requisições do sistema é compartilhado com a tela do candidato, então um painel que │
 * │ se atualizasse sozinho em várias mesas competiria com quem está tentando entrar para enviar     │
 * │ documento. Como o tropeço ("agi e o número não mudou") vale em QUALQUER caminho da tela, ele     │
 * │ mora aqui, e não num artigo só.                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS MENSAGENS SÃO AS DO CÓDIGO, letra por letra ("Falha ao carregar o painel do portal.", em
 * `app/(app)/admin/portal-links/page.tsx`).
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa real, e nenhuma URL de link neste arquivo.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "portal",
  rotulo: "Gerenciador Do Portal",
  preRequisitos: [
    "Ter o menu Portal Do Candidato liberado para o seu usuário.",
    "Saber que esta tela é o lado do time. A tela que o candidato abre é outra, e só se chega nela pelo link que sai daqui.",
    "A admissão já precisa existir no sistema, com cliente e cargo. A lista de documentos que o candidato vai enviar resolve por cliente mais cargo, então sem os dois não há o que cobrar dele.",
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Falha ao carregar o painel do portal.",
      acao: "A consulta não voltou. Clique em Atualizar. Se repetir, recarregue a página, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "Fiz alguma coisa e os números do topo continuam iguais.",
      acao: "Este painel não se atualiza sozinho, e a própria tela avisa isso logo acima dos cards. Clique em Atualizar para buscar os números de agora.",
    },
    {
      sintoma: "As abas Em Andamento e Concluído ficaram apagadas e não clicam.",
      acao: "Há um card do funil aceso, e ele recorta todos os candidatos nas duas abas. Clique no card aceso de novo para voltar a usar as abas.",
    },
    {
      sintoma:
        "A lista diz Nenhum candidato neste recorte. ou Nenhum candidato com os filtros aplicados.",
      acao: "É recorte, não falta de trabalho. Clique no card aceso para desfazê-lo, apague o que está na busca por nome e limpe os filtros pelo ícone de filtro da barra.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você digitou. Saia pelo Fechar ou pela tecla Esc.",
    },
  ],
};
