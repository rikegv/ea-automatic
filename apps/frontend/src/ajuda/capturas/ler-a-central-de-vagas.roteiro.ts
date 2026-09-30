/**
 * ─ ROTEIRO: "Ler A Central De Vagas". TRÊS imagens, UM estado de tela ──────────────────────────
 *
 * ┌─ O PREPARO DO ROTEIRO É UMA BUSCA, E ELE É MEDIDA DE §A.6, NÃO ENQUADRAMENTO ────────────────┐
 * │ Esta tela tem a coluna "Consultor Responsável", que escreve NOME DE USUÁRIO da homologação, e   │
 * │ a homologação tem 42 pessoas reais na denylist do gate. Sem recorte a tela inteira viraria PNG  │
 * │ com o nome delas dentro; com recorte, o que sobraria fora do quadro seria justamente a tabela   │
 * │ que este artigo existe para ensinar.                                                           │
 * │                                                                                                │
 * │ A SAÍDA É RECORTAR A **POPULAÇÃO**, E NÃO OS PIXELS: a busca da tela cobre qualquer coluna, e   │
 * │ `SIM-` alcança só vaga sintética, cujo consultor, cujo autor e cuja                             │
 * │ carteira são a conta de captura, declarada na allowlist. A tabela continua inteira na imagem, e │
 * │ nenhuma pessoa real entra no quadro. O gate continua auditando o que ficou: o recorte da        │
 * │ população não dispensa nada, só troca o que a tela está mostrando.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE NENHUMA DAS TRÊS IMAGENS TEM `recorte` ─────────────────────────────────────────────┐
 * │ A lição de 30/09 (ver `entrar-no-sistema.roteiro.ts`) é que a caixa precisa caber o alvo MAIS   │
 * │ o rótulo dele, e recorte no contorno exato produz imagem que passa em todos os gates e não      │
 * │ ensina nada. Aqui os alvos são títulos de faixa e cabeçalhos de coluna, que ficam colados na    │
 * │ borda esquerda e no topo dos seus blocos: qualquer caixa justa jogaria os rótulos para fora.    │
 * │ A viewport de 1600x1000 é o quadro, e ela dá espaço de sobra nos dois lados.                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS TRÊS IMAGENS PARTEM DO MESMO ESTADO, então nenhuma declara `preparo` próprio: o do roteiro
 * basta, e é ele que satisfaz a régua de "imagem que não é a primeira precisa de preparo em algum
 * lado". Imagem que depende do que a anterior deixou na tela é imagem que não pode ser recapturada
 * sozinha.
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * O RECORTE DA POPULAÇÃO. `SIM-` casa com TODAS as vagas da homologação, e isso não afrouxa o
 * recorte: as 5 vagas de lá são sintéticas (medido em 30/09/2026, `count(*)` 5 e `codigo like 'SIM%'`
 * 5), e a entregue não tem solicitante, consultor nem substituído, então nenhuma coluna de pessoa
 * tem o que escrever.
 *
 * ┌─ POR QUE ALARGUEI, E É A IMAGEM QUE PEDIU ──────────────────────────────────────────────────┐
 * │ O termo anterior era `SIM-AS-2026`, que alcança só as vagas do arnês novo, TODAS elas em      │
 * │ prazo corrente. O artigo passou a ensinar o estado "Vaga Entregue", em que o SLA PARA no lugar │
 * │ de continuar contando, e a única vaga ENTREGUE da base é a `SIM-2026-0501`, do arnês antigo,   │
 * │ que aquele termo deixava de fora. A imagem ensinava a coluna e escondia justamente o estado    │
 * │ novo que o texto ao lado dela descreve. §A.13 pegou isso ao OLHAR o PNG, não ao rodar o gate.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A lista padrão esconde a CANCELADA, então sobram quatro linhas (ABERTA, RASCUNHO,
 * PENDENTE_REVISAO e ENTREGUE): nunca zero, que é o que a recusa por lista vazia exige.
 */
const SO_AS_VAGAS_DO_ARNES: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    valor: "SIM-",
  },
];

export const roteiro: Roteiro = {
  slug: "ler-a-central-de-vagas",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: SO_AS_VAGAS_DO_ARNES,
  capturas: [
    {
      arquivo: "01-faixas-de-indicador.png",
      legenda:
        "Passo 2: as três faixas de indicador do topo. Status conta vagas, Inserção Por Etapa e Desfechos contam gente.",
      alvos: [
        /*
         * OS TÍTULOS DE FAIXA SÃO `<h3>` (`TituloDaFaixa`), então papel mais nome resolve sem
         * seletor. O nome acessível carrega o nível entre parênteses ("Status (Nível Vaga)"), e é
         * por isso que os três são casados por expressão e não por texto inteiro: o dia em que o
         * rótulo do nível mudar, o alvo continua de pé, que é o comportamento certo, porque o nível
         * é apoio e não o nome da faixa.
         */
        { papel: "heading", nome: /^Status/, texto: "1. Conta vagas", lado: "direita" },
        {
          papel: "heading",
          nome: /^Inserção Por Etapa/,
          texto: "2. Conta gente em seleção",
          lado: "direita",
        },
        { papel: "heading", nome: /^Desfechos/, texto: "3. O que já foi decidido", lado: "direita" },
      ],
    },
    {
      arquivo: "02-colunas-da-tabela.png",
      legenda: "Passo 6: o cabeçalho da tabela, com as colunas que identificam e situam a vaga.",
      alvos: [
        /*
         * O CABEÇALHO DE COLUNA É UM `<button>` DE VERDADE, dentro do `<th>` (`ColunaOrdenavel`,
         * §A.29), e o nome acessível dele é o texto da coluna. Apontar o `<th>` exigiria seletor,
         * porque `columnheader` não está no vocabulário de `Alvo`; apontar o botão resolve por papel
         * mais nome, que é a régua da casa.
         *
         * ┌─ AS EXPRESSÕES SÃO ANCORADAS (`^...$`), E ISSO NÃO É ZELO: É CONSERTO MEDIDO ────────┐
         * │ `nome` em TEXTO casa por SUBSTRING no localizador acessível, e com `.first()` quem      │
         * │ vence é o primeiro da página. "Posições" pegou o card "Posições Abertas", lá em cima na │
         * │ faixa de indicadores, e a seta saiu desenhada sobre o KPI com o rótulo "Metas e gente   │
         * │ no funil" ao lado. NADA FALHOU: o alvo resolveu, o gate passou, a imagem foi gravada    │
         * │ ensinando a coisa errada, e só apareceu ao OLHAR o PNG (§A.13). Expressão ancorada casa │
         * │ o nome INTEIRO e elimina a classe toda do problema.                                     │
         * └────────────────────────────────────────────────────────────────────────────────────────┘
         */
        { papel: "button", nome: /^Código$/, texto: "4. O número do processo", lado: "acima" },
        { papel: "button", nome: /^Posições$/, texto: "5. Metas e gente no funil", lado: "acima" },
        {
          papel: "button",
          nome: /^SLA De Entrega$/,
          texto: "6. A cor vem antes do número",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "03-botao-de-gestao-da-vaga.png",
      legenda: "Passo 9: o botão da coluna Ações, que abre a vaga inteira.",
      alvos: [
        {
          /*
           * O NOME ACESSÍVEL CARREGA O CÓDIGO DA VAGA (`Abrir a gestão da vaga SIM-AS-2026-0601`),
           * e isso é DADO DE PROCESSO, nunca de pessoa: a régua de evitar nome no alvo vale para
           * nome de gente, e o código é justamente o que torna este alvo preciso em vez de depender
           * da ordem das linhas.
           */
          papel: "button",
          nome: /Abrir a gestão da vaga SIM-AS-2026-0601/,
          texto: "7. Abre a gestão da vaga",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
