/**
 * ─ ROTEIRO: "Ler A Central De Candidatos". TRÊS imagens, DOIS escopos de tela ────────────────────
 *
 * ┌─ A TELA INTEIRA É GENTE, E MESMO ASSIM ELA PODE VIRAR IMAGEM. O MOTIVO É O ARNÊS ────────────┐
 * │ A lista de candidatos é nome de pessoa em toda linha, e por isso a captura desta rota esteve   │
 * │ vetada enquanto a homologação não tinha o que fotografar. O que mudou foi DADO, não régua: as  │
 * │ 15 linhas de `as_candidatos` da homologação são TODAS do arnês sintético (medido em            │
 * │ 30/09/2026: 15 de 15 com o prefixo SIMULADO), e cada nome, CPF, telefone e e-mail delas está    │
 * │ declarado um a um em `tools/ajuda/allowlist-arnes.json`.                                       │
 * │                                                                                                │
 * │ NÃO HÁ PREPARO DE BUSCA NESTE ROTEIRO, e a ausência é medida, não descuido: os roteiros do     │
 * │ Gerenciador digitam `999000` na busca porque ali a base é real e o arnês é minoria. Aqui a base │
 * │ INTEIRA é o arnês, então uma busca só serviria para esconder parte do que o artigo ensina.      │
 * │ Entrando uma linha real nesta tabela, o gate recusa a imagem (denylist de equipe) em vez de     │
 * │ gravar, que é o lado seguro.                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NENHUM ALVO É UM BOTÃO DE LINHA COM NOME DE PESSOA DENTRO ─────────────────────────────────┐
 * │ A coluna Ações tem CINCO botões por linha, e o nome acessível de todos eles carrega o nome da  │
 * │ pessoa daquela linha ("Ver a ficha de ...", "Mover ... de etapa", §A.6). Apontá-los por papel e │
 * │ nome traria gente para dentro deste arquivo e amarraria o print a UM registro: o localizador    │
 * │ quebraria na primeira mudança de dado, e quebraria acusando "artigo velho" com o artigo certo.  │
 * │ O alvo da terceira imagem é o `title` do botão, que é texto FIXO da tela. É a saída de          │
 * │ emergência do `seletor` usada pelo motivo para o qual ela existe.                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA DE RECORTE DA CASA, e ela vale para TODA captura futura, não só para esta ──────────┐
 * │ QUEM DECIDE ONDE O RÓTULO CABE MEDE CONTRA A **VIEWPORT**, NUNCA CONTRA A CAIXA RECORTADA.      │
 * │ A escolha de lado, o clamp de borda e o desvio por colisão só conhecem a tela inteira, então um │
 * │ recorte estreito não "aperta" a legenda: ele a deixa desenhada FORA da imagem. O PNG sai com a  │
 * │ elipse muda, passa em todos os gates e entra no manual ensinando nada. Nenhum gate pega isso.   │
 * │ Só olhar a imagem pega (§A.13), e foi assim que apareceu, três vezes em uma rodada.             │
 * │                                                                                                │
 * │ A REGRA PRÁTICA, em duas linhas:                                                                │
 * │   . IMAGEM DE JANELA (modal estreito) NÃO LEVA RECORTE. O painel é mais estreito que os rótulos │
 * │     precisam, e o fundo escurecido atrás dele é contexto, não vazamento, desde que o que está    │
 * │     na tela seja o arnês sintético.                                                             │
 * │   . IMAGEM DE LISTA leva recorte no CONTÊINER (o `<main>`), nunca no cartão da tabela. O cartão  │
 * │     costuma ser mais alto que a viewport, e aí o motor recusa com "alvo fora da viewport".       │
 * │                                                                                                │
 * │ E quando o recorte for exigência de §A.6 (tela que mostra gente de verdade), a conta é outra: o  │
 * │ recorte manda, e a imagem perde alvos até caber. Ver a janela de alocação do artigo irmão.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A FICHA DO CANDIDATO NÃO ENTRA EM IMAGEM NENHUMA. A terceira imagem aponta o botão que a abre e
 * PARA ALI: a janela da ficha foi vetada pelo `seguranca` ("não fotografa"), porque ela concentra
 * documento, telefone, e-mail e nascimento num bloco só. Apontar a porta é ensinar; abri-la, não.
 */
import type { Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo: é o `<main>` da casca do sistema. */
const PAGINA = "main";
/**
 * O cartão da tabela. Os cards do topo também são `glass`, mas são `<button>`; o cartão da lista é
 * o único `div` com `overflow-hidden` nesta tela, então o localizador cai nele.
 */
const TABELA = "div.glass.overflow-hidden";

export const roteiro: Roteiro = {
  slug: "ler-a-central-de-candidatos",
  url: "/as/candidatos",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-visao-da-central.png",
      legenda:
        "Passos 2 a 5: a Central aberta no escopo Em Andamento, com os cards do funil e a tabela.",
      // Sem preparo: esta é a tela como ela chega, e é justamente o escopo que o passo 2 ensina.
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        { papel: "button", nome: "Em Andamento", texto: "1. Escolha o escopo", lado: "acima" },
        {
          /*
           * O NOME ACESSÍVEL DO CARD CARREGA O NÚMERO DELE ("1 Contratado"), porque o botão é o
           * cartão inteiro: valor e rótulo. Por isso o localizador é por EXPRESSÃO e casa só o
           * rótulo, que é a parte estável. Um nome exato quebraria a cada candidatura nova.
           *
           * ─ POR QUE O ÚLTIMO CARD DA FILEIRA, E NÃO O "Total", QUE SERIA O ÓBVIO ────────────────
           *
           * Por ESPAÇO, e foi medido olhando o PNG (§A.13): as duas fileiras de cards ocupam a tela
           * de ponta a ponta, e o único vão livre é o que sobra à direita do card que quebrou para a
           * segunda linha. O rótulo do "Total" cai em cima do card de baixo; o do ÚLTIMO card da
           * fileira cai nesse vão.
           *
           * ELE É RÓTULO DE CATÁLOGO, e isso está assumido: a fileira de etapas é montada do
           * catálogo do funil, que o diretor renomeia. Renomeada a etapa, o alvo não resolve e o
           * motor FALHA, que é o comportamento desejado (o detector de artigo velho), e não uma
           * imagem gravada sem a seta.
           */
          papel: "button",
          nome: /Contratado/,
          texto: "2. Uma coluna por etapa do funil",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-escopo-historico.png",
      legenda: "Passo 4: o escopo Histórico, com um card para cada desfecho da segunda fileira.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Histórico", texto: "" } }],
      recorte: { seletor: PAGINA, texto: "" },
      /*
       * OS DOIS RÓTULOS VÃO PARA CIMA, e a razão saiu da prova visual (§A.13): abaixo da fileira de
       * desfechos começa a TABELA, então todo rótulo posto "abaixo" cai sobre o cabeçalho dela e
       * apaga o nome de uma coluna. Para cima, ele cai sobre a fileira de etapas, que no escopo
       * Histórico está inteira zerada. Cobrir um card que marca zero custa menos do que cobrir o
       * nome de uma coluna, que é justamente o que a terceira imagem ensina.
       */
      alvos: [
        { papel: "button", nome: "Histórico", texto: "4. Quem já teve desfecho", lado: "acima" },
        {
          papel: "button",
          nome: /Descartados Pela Seleção/,
          texto: "5. Um card por saída",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "03-linha-da-lista.png",
      legenda: "Passos 6 a 8: a linha da tabela, com a etapa, a situação e os ícones da coluna Ações.",
      preparo: [{ acao: "rolarAte", alvo: { seletor: TABELA, texto: "" } }],
      /*
       * O RECORTE É O `<main>`, E NÃO O CARTÃO DA TABELA, e a causa foi MEDIDA (30/09/2026): com as
       * doze linhas do arnês, o cartão tem mais altura do que a viewport de captura (1600x1000), e o
       * motor recusa com "ALVO FORA DA VIEWPORT depois da rolagem", que é a recusa certa. O `<main>`
       * tem exatamente a altura da viewport, então a caixa cabe, e a rolagem do preparo é o que
       * garante que o que está dentro dela seja a tabela.
       */
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          /*
           * ─ ÂNCORAS, E ELAS NÃO SÃO CAPRICHO: O NOME CASA POR PEDAÇO ─────────────────────────
           *
           * O localizador do motor compara o nome acessível por SUBSTRING, não por igualdade. Sem as
           * âncoras, "Etapa" casava com o CARD "Etapa Soulan" da fileira de cima, que vem antes na
           * página, e o motor resolve pelo primeiro. Medido olhando o PNG (§A.13): a seta saía
           * desenhada sobre o card, não sobre a coluna, e NADA falhou. Alvo que não resolve o motor
           * acusa; alvo que resolve no elemento errado ninguém acusa.
           */
          papel: "button",
          nome: /^Etapa$/,
          texto: "7. Onde ela está no funil",
          lado: "acima",
        },
        {
          papel: "button",
          nome: "Último Contato",
          texto: "8. Quando se falou com ela",
          lado: "acima",
        },
        {
          /*
           * O `title` DO BOTÃO, E NÃO O NOME ACESSÍVEL DELE. O nome acessível é "Ver a ficha de "
           * mais o nome da pessoa da linha (§A.6), então papel mais nome traria gente para este
           * arquivo. O `title` é texto fixo da tela e não muda com o dado.
           */
          seletor: `${TABELA} button[title="Ver a ficha"]`,
          texto: "9. Abre a ficha",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
