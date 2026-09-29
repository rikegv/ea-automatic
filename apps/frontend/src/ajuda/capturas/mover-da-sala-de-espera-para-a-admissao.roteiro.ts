/**
 * ROTEIRO DE CAPTURA: "Mover Da Sala De Espera Para A Admissão".
 *
 * ┌─ AS DUAS IMAGENS SÃO RECORTADAS, E AQUI O RECORTE NÃO EVITA A GENTE, SÓ APERTA A CAIXA ─────┐
 * │ A Sala De Espera está na lista das telas que não podem virar imagem inteira (bloco do `recorte`, │
 * │ em `tipos.ts`), e o livreto do vínculo é a tela mais densa de pessoa do sistema: ele mostra os    │
 * │ dois lados do casamento ao mesmo tempo. Diferente do roteiro irmão, aqui NÃO dá para recortar     │
 * │ fora da gente: o que o artigo ensina É a linha e É o livreto. Então o recorte aperta a caixa, e   │
 * │ quem protege é o gate, que roda DENTRO dela.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS ALVOS DA LINHA CARREGAM O NOME NO RÓTULO ACESSÍVEL, ENTÃO SÃO CASADOS POR EXPRESSÃO ────┐
 * │ O botão de vínculo se anuncia como "Vincular admissão de <NOME>" e o lápis como "Editar <NOME>". │
 * │ Casar só o COMEÇO mantém este arquivo sem nenhum nome dentro (§A.6) e continua falhando em voz   │
 * │ alta no dia em que o rótulo mudar, que é o que se quer de um detector.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O RISCO CONHECIDO DESTE ROTEIRO É DE DADO, NÃO DE ALVO ────────────────────────────────────┐
 * │ A segunda imagem depende de existir ALGUÉM na aba Aguardando, porque o livreto só abre a partir  │
 * │ de uma linha. Fila vazia faz o preparo falhar, e a falha é honesta: ela diz que a homologação     │
 * │ está sem registro na Sala, não que o artigo envelheceu. A leitura da mensagem é o que separa as   │
 * │ duas coisas.                                                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BUSCA DO PREPARO EXISTE POR COLISÃO DE NOME, E A COLISÃO FOI MEDIDA ──────────────────────┐
 * │ O gate recusava a imagem 1 por `NOME_DE_USUARIO: 23 homolog`, e o achado era VERDADEIRO: a       │
 * │ denylist de equipe procura os PARES de palavras vizinhas de cada usuário do time, e a            │
 * │ homologação tem contas numeradas no formato "Usuario NN Homolog". Os registros da Sala seguem o   │
 * │ mesmo formato, "Espera NN Homolog", então a linha de número 23 casava o par "23 homolog" da conta │
 * │ de número 23. NADA de colega é desenhado nesta tela: a Sala não tem coluna de autoria, e o que    │
 * │ colidiu foi o SUFIXO de dois nomes sintéticos.                                                    │
 * │                                                                                                │
 * │ A DENYLIST NÃO SE MEXE, e é a única saída honesta: ela ganha de tudo por desenho, e alargar a     │
 * │ dispensa por causa de um sufixo tiraria a proteção do time inteiro. O conserto é de PREPARO.      │
 * │                                                                                                │
 * │ A JANELA DE COLISÃO É DE 10 A 23, e ela vem do zero à esquerda: as contas são zero-padded         │
 * │ ("Usuario 04 Homolog" gera o par "04 homolog") e os registros da Sala não são ("Espera 4          │
 * │ Homolog" gera "4 homolog"), então os números de UM dígito nunca casam. Digitar `espera 4` na      │
 * │ busca da tela alcança só o 4 e a faixa dos 40, que ficam FORA da janela, e deixa a fila da aba    │
 * │ Aguardando com três linhas (medido em 28/09/2026: 4, 42 e 45), o bastante para a tabela mostrar    │
 * │ a forma dela sem nenhuma linha em colisão.                                                        │
 * │                                                                                                │
 * │ TRÊS LINHAS E NÃO UMA, de propósito: um registro que seja vinculado amanhã sai da aba, e com um   │
 * │ só o preparo passaria a falhar como "a tela mudou", que é a mensagem do detector de artigo velho, │
 * │ mandando procurar defeito num roteiro certo. Conta nova do time com número de dois dígitos volta  │
 * │ a colidir, e aí a falha é dura e o conserto é o termo, nunca o gate.                              │
 * │                                                                                                │
 * │ ELA NÃO MUDA O TEXTO DO ARTIGO (§A.43): digitar na busca é artefato de captura, não passo do       │
 * │ manual, e a barra de busca mora FORA do cartão recortado das duas imagens.                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';
/** A lista da Sala, casada pela classe do padrão de tabela em grade do sistema. */
const LISTA = "div.glass.list";
/** O botão de vínculo da linha. O rótulo acessível carrega o nome, então casa-se só o começo. */
const VINCULAR = { papel: "button" as const, nome: /^Vincular admissão de/, texto: "" };
/** A busca do topo da Sala, casada pelo rótulo acessível (o `type="search"` não é um textbox). */
const BUSCA = 'input[aria-label="Buscar na Sala de Espera"]';
/**
 * O FILTRO QUE TIRA A LINHA EM COLISÃO DA FILA, e ele roda antes das DUAS imagens: a segunda abre o
 * livreto a partir de uma linha da primeira, então filtrar só a primeira deixaria o livreto sendo
 * aberto de uma linha que a imagem anterior não mostra.
 */
const FILTRAR_A_FILA: GestoDePreparo = {
  acao: "digitar",
  alvo: { seletor: BUSCA, texto: "" },
  valor: "espera 4",
};

export const roteiro: Roteiro = {
  slug: "mover-da-sala-de-espera-para-a-admissao",
  url: "/sala-espera",
  preparo: [FILTRAR_A_FILA],
  capturas: [
    {
      arquivo: "01-botao-vincular.png",
      legenda: "Passo 1: a linha da aba Aguardando, com o botão Vincular.",
      recorte: { seletor: LISTA, texto: "" },
      alvos: [
        { ...VINCULAR, texto: "2. Abre o livreto", forma: "elipse", lado: "esquerda" },
        {
          papel: "button",
          nome: "Status",
          texto: "7. Aqui se encerra quem não veio",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-livreto-do-vinculo.png",
      legenda: "Passo 3: o livreto do vínculo, com a Sala de um lado e a Liberação do outro.",
      preparo: [{ acao: "clicar", alvo: VINCULAR }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "textbox",
          nome: "Buscar admissão na Liberação",
          texto: "4. Ache a admissão",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Cancelar",
          texto: "5. A pergunta nasce aqui",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
