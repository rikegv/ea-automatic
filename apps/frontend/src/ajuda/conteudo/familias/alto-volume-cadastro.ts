import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o CADASTRO de um projeto de alto volume.
 *
 * Reúne as quatro peças que MONTAM o projeto: criar, cadastrar os grupos de entrada, cadastrar as
 * metas por cargo e vincular as admissões. Elas tropeçam nas mesmas coisas: o período que precisa
 * existir antes dos grupos, a meta que precisa existir antes de a contagem fazer sentido, e a
 * admissão que já está em outro projeto.
 *
 * ┌─ O QUE ESTA FAMÍLIA NÃO COBRE, E A DIVISÃO É DELIBERADA ────────────────────────────────────┐
 * │ A ANÁLISE do projeto (os indicadores, o termômetro, a leitura do andamento) é outra tela e     │
 * │ outro público: quem cadastra monta a estrutura, quem analisa lê o resultado. Misturar as duas  │
 * │ faria o artigo de cadastro virar aula de indicador, e é assim que um manual deixa de responder │
 * │ a pergunta que a pessoa tinha na mão.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TRAVA QUE PROTEGE A CONTAGEM mora no vínculo: a mesma admissão não entra duas vezes no mesmo
 * projeto. Sem ela, um mesmo candidato contaria em dobro na meta, e a conta do projeto deixaria de
 * fechar sem ninguém perceber. É o fato que os quatro artigos precisam dizer igual, então ele mora
 * aqui uma vez.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "alto-volume-cadastro",
  rotulo: "Projetos De Alto Volume",
  preRequisitos: [
    "Ter o menu de Alto Volume liberado para o seu usuário, e ser Master ou Super Admin.",
    "O cliente já precisa estar cadastrado: o projeto nasce ligado a um cliente, e esta tela não cria cliente.",
    "Saber o período do projeto e quantas posições por cargo ele precisa entregar: é disso que a contagem vive.",
  ],
  seDerErrado: [
    {
      sintoma: "A admissão que você quer vincular não aparece na lista.",
      acao: "A lista oferece só quem ainda não está no projeto. Se a pessoa já foi vinculada, ela sai da lista de oferta e passa a aparecer entre as vinculadas. Confira lá antes de concluir que ela sumiu.",
    },
    {
      sintoma: "O sistema recusa vincular alguém que você acha que não está no projeto.",
      acao: "A mesma admissão não entra duas vezes, e é essa trava que impede a contagem de dobrar. Procure a pessoa entre as já vinculadas: quase sempre ela está lá.",
    },
    {
      sintoma: "A contagem do projeto não fecha com o que você esperava.",
      acao: "Confira as três peças que alimentam a conta, nesta ordem: o período do projeto, os grupos de entrada e a meta por cargo. Meta não cadastrada faz o projeto contar entregas contra zero.",
    },
    {
      sintoma: "Você removeu um grupo de entrada e as admissões dele continuam no projeto.",
      acao: "São coisas separadas: o grupo é a leva de datas, e o vínculo é da admissão com o projeto. Desvincule as admissões pela lista de vinculadas.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
