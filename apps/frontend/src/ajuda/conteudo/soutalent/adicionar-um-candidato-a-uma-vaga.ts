import type { Artigo } from "../../tipos";

/**
 * ─ ADICIONAR UM CANDIDATO A UMA VAGA: a porta que parte da BASE, e não do CPF ────────────────────
 *
 * O QUE ESTA PEÇA COBRE: o botão Adicionar à vaga da Central De Candidatos, que escolhe a PESSOA
 * pelo nome, entre quem está na base e não está em vaga nenhuma. É o caminho de quem foi cadastrado
 * SEM CPF, e essa é a razão de ele existir: o outro caminho começa pelo número, então quem não tem
 * número ficava na base sem entrar em vaga nenhuma. Cobre também as duas recusas desta porta, que
 * NÃO são a mesma coisa: quem já está viva naquela vaga é erro seco, e quem já teve processo
 * encerrado naquela vaga é PERGUNTA, com confirmação.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ───────────────────────────────────────────────────┐
 * │ O LOTE DENTRO DA VAGA (escolher vários de uma vez, a partir do painel da vaga) é artigo de    │
 * │ outra peça desta mesma onda, e o recorte é de DIREÇÃO: aqui o gesto nasce na pessoa e escolhe  │
 * │ a vaga; lá ele nasce na vaga e escolhe as pessoas. Ensinar os dois no mesmo texto faria o      │
 * │ leitor procurar o botão errado na tela errada.                                                │
 * │                                                                                               │
 * │ CADASTRAR alguém que ainda não está na base é a peça irmã. Aqui a pessoa JÁ existe.            │
 * │ MOVER DE ETAPA depois de alocada é artigo próprio: esta peça termina no momento em que a       │
 * │ candidatura nasce.                                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA DA LISTA, MEDIDA NO CÓDIGO, QUE EXPLICA 90% DAS PERGUNTAS SOBRE ESTA JANELA ───────┐
 * │ A lista oferece SÓ quem não tem candidatura VIVA em lugar nenhum. Então quem foi descartado   │
 * │ numa vaga e segue em seleção em outra NÃO aparece aqui, e não é defeito: a porta dessa pessoa  │
 * │ é a volta, na própria linha dela na tabela. Sem essa frase, o consultor procura na lista       │
 * │ errada e conclui que a pessoa foi apagada.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: esta janela mostra nome, cidade e a informação de que a pessoa TEM ou NÃO TEM CPF, nunca o
 * número. Nenhum nome, CPF, contato ou endereço de pessoa foi copiado para este arquivo.
 *
 * OS PRINTS FOTOGRAFAM OS DOIS SELETORES **FECHADOS**, de propósito: aberto, o de candidato lista
 * nome, cidade e a marca de quem não tem CPF, pessoa a pessoa. Fechado, ele mostra o texto de apoio
 * e a contagem de quantas estão disponíveis, que é o que o passo 2 ensina. A confirmação de
 * reentrada do passo 5 ficou sem imagem porque ela só existe DEPOIS de uma alocação de verdade, e o
 * motivo está registrado no roteiro, ao lado deste arquivo.
 */
export const artigo: Artigo = {
  slug: "adicionar-um-candidato-a-uma-vaga",
  titulo: "Adicionar Um Candidato A Uma Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como colocar numa vaga alguém que já está na base, escolhendo pelo nome, inclusive quem foi cadastrado sem CPF, e o que o sistema responde quando aquela pessoa já tem processo naquela vaga.",
  termos: [
    "adicionar a vaga",
    "alocar candidato",
    "colocar candidato na vaga",
    "por candidato em vaga",
    "vincular candidato a vaga",
    "candidato sem cpf em vaga",
    "escolher pelo nome",
    "alocar em vaga",
    "candidato ja esta na vaga",
    "trazer de volta candidato",
    "reentrada em vaga",
    "candidato disponivel na base",
  ],
  preRequisitos: [
    "A pessoa já precisa estar na base: se ela ainda não está, cadastre-a primeiro.",
    "A vaga precisa estar aberta. Vaga pendente de revisão, sem cliente vinculado, não recebe alocação manual.",
  ],
  passos: [
    {
      gesto: "Na Central De Candidatos, clique em Adicionar à vaga, no topo à direita.",
      detalhe:
        "A janela abre com a lista de quem está na base e não está em vaga nenhuma, inclusive quem não tem CPF cadastrado.",
      print: {
        arquivo: "01-botao-adicionar-a-vaga.png",
        legenda: "O botão de adicionar à vaga, no topo da Central De Candidatos.",
      },
      controles: ["Adicionar à vaga", "Adicionar Candidato À Vaga"],
    },
    {
      gesto: "Escolha a pessoa no campo Candidato, digitando parte do nome.",
      detalhe:
        "Ao lado de cada nome vem a cidade, a origem e, quando for o caso, a marca de que aquela pessoa não tem CPF cadastrado. É o que distingue dois nomes parecidos sem o número aparecer na tela. Abaixo do campo, o sistema diz quantas pessoas estão disponíveis.",
      print: {
        arquivo: "02-janela-de-alocacao.png",
        legenda:
          "O corpo da janela de alocação, com o campo em que se escolhe a pessoa pelo nome.",
      },
    },
    {
      gesto: "Escolha a vaga no campo Vaga.",
      detalhe:
        "Só vaga aberta aparece. O campo procura pelo nome de divulgação e pelo cliente, então dá para chegar na vaga pelos dois caminhos.",
    },
    {
      gesto: "Clique em Alocar em vaga.",
      detalhe:
        "A candidatura nasce na primeira etapa do funil, e mover adiante é a ação da própria linha na tabela. A pessoa passa a aparecer na lista com a vaga, o cliente e o cargo preenchidos.",
      controles: ["Alocar em vaga", "Cancelar"],
    },
    {
      gesto:
        "Se o sistema perguntar sobre um processo anterior, leia o bloco O Processo Anterior antes de decidir.",
      detalhe:
        "Nada foi alocado ainda. A janela mostra como terminou, quando terminou e o motivo registrado daquele processo. Confirmando, nasce uma candidatura nova e a anterior continua no histórico, inteira.",
      controles: ["Reentrada Em Vaga Encerrada", "O Processo Anterior", "Estou Ciente"],
    },
    {
      gesto:
        "Para trazer de volta quem já teve processo encerrado, use a volta na linha da própria pessoa, na tabela.",
      detalhe:
        "Essa pessoa não aparece na lista da janela, de propósito. A janela abre no modo de volta, com ela já escolhida e a vaga anterior sugerida, e trocar de vaga é permitido.",
      controles: ["Trazer De Volta"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa que eu procuro não está na lista da janela.",
      acao: "A lista oferece só quem não está em vaga nenhuma. Quem já está em seleção em alguma vaga não aparece aqui: para trocar a vaga dela, use a ação de troca na linha, disponível para Master e Super Admin. Quem foi descartado ou desistiu volta pela ação de volta, na linha dela.",
    },
    {
      sintoma:
        "A janela diz Todo mundo que está na base já foi alocado em alguma vaga.",
      acao: "Não há ninguém na base fora de vaga neste momento. Para trazer alguém novo, use o botão Novo candidato.",
    },
    {
      sintoma: "A janela avisa que está mostrando parte das pessoas disponíveis.",
      acao: "A lista tem teto, e o aviso diz quantas de quantas você está vendo. Digite parte do nome no campo para alcançar quem não está na janela.",
    },
    {
      sintoma: "A tela mostra Esta pessoa já está nesta vaga.",
      acao: "Ela já tem processo aberto naquela vaga, e não há o que confirmar: duas candidaturas vivas na mesma vaga não existem. Confira a linha dela na tabela, filtrando pela vaga.",
    },
    {
      sintoma: "A tela mostra Esta vaga está Fechada e não recebe candidato novo.",
      acao: "A vaga foi encerrada. Escolha uma vaga aberta. Se aquela vaga precisa voltar a receber gente, isso se resolve na Central De Vagas, no status da vaga.",
    },
    {
      sintoma: "A vaga que eu quero não aparece no campo Vaga.",
      acao: "Ou ela não está aberta, ou ela está pendente de revisão, ainda sem cliente vinculado. Vaga pendente não recebe alocação manual: libere-a primeiro, vinculando o cliente, e ela passa a aparecer aqui.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar os candidatos disponíveis.",
      acao: "A lista não voltou. Feche a janela e abra de novo. Se repetir, recarregue a página e avise a administração.",
    },
  ],
  regras: [
    "A escolha é pelo nome, e o CPF não é pedido nem lido em ponto nenhum deste caminho: é por isso que ele serve para quem foi cadastrado sem CPF.",
    "A lista oferece só quem não tem candidatura viva em vaga nenhuma. Quem já está em seleção não aparece aqui.",
    "Quem já está viva naquela vaga é recusada de vez: uma pessoa não tem dois processos abertos na mesma vaga.",
    "Quem já teve processo encerrado naquela vaga não é recusada, é perguntada: a confirmação mostra como terminou, quando e por quê.",
    "A volta cria uma candidatura nova. O processo anterior não é apagado nem reaproveitado, e os dois continuam na ficha da pessoa.",
    "A candidatura nasce na primeira etapa do funil. Mover adiante é ação da linha, depois.",
    "Só vaga aberta recebe candidato. Vaga pendente de revisão fica fora da lista enquanto não tiver cliente vinculado.",
  ],
  relacionados: [
    "cadastrar-um-candidato-novo",
    "ler-a-central-de-candidatos",
    "ler-a-ficha-do-candidato",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/AlocarCandidatoModal.tsx",
    "apps/frontend/src/components/as/candidatos/ConfirmarReentradaModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
