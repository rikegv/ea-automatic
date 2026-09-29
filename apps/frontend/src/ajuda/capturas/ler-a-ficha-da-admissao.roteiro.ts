/**
 * ROTEIRO DE CAPTURA: "Ler A Ficha Da Admissão".
 *
 * ┌─ A FICHA ESTÁ NA LISTA DAS TELAS QUE **NÃO PODEM** VIRAR IMAGEM INTEIRA ─────────────────────┐
 * │ Ela mostra nome, CPF, telefone, e-mail e data de nascimento na primeira dobra. As três imagens  │
 * │ recortam o PAINEL da janela, e o gate de dado pessoal audita dentro da caixa, que é a ordem que │
 * │ o bloco do `recorte` exige: recortar sem auditar o recorte só troca o vazamento grande por um   │
 * │ pequeno.                                                                                       │
 * │                                                                                                │
 * │ O recorte aponta o `.panel`, e NÃO o `role="dialog"`: o papel de diálogo mora no véu que cobre a │
 * │ tela inteira, então recortar por ele seria a tela inteira com outro nome.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FICHA ABERTA É A DA LINHA SINTÉTICA, E O LOCALIZADOR É A GARANTIA DISSO ──────────────────┐
 * │ A ficha não tem endereço próprio: ela abre a partir de uma LINHA, então o preparo precisa clicar │
 * │ no olho de alguma. Se ele clicasse no primeiro olho da tabela, um atraso na busca faria a janela │
 * │ abrir com uma pessoa de verdade dentro, e a imagem seria gravada com ela.                       │
 * │                                                                                                │
 * │ Então o olho é procurado DENTRO da linha da conta sintética, pelo nome dela. O nome é do arnês e │
 * │ está declarado na allowlist (`tools/ajuda/allowlist-arnes.json`): não é dado de pessoa. E se a   │
 * │ linha não estiver na tela, o preparo FALHA em voz alta em vez de abrir a ficha de outra pessoa,  │
 * │ que é exatamente o comportamento que se quer de uma barreira.                                   │
 * │                                                                                                │
 * │ A LINHA ESCOLHIDA É A COMPLETA (a que tem pasta no Drive), porque é a única em que o bloco de    │
 * │ frentes mostra o atalho do prontuário, e ele é um dos controles que o artigo ensina.             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE OS ALVOS DOS BLOCOS SÃO `seletor`, E NÃO PAPEL MAIS NOME ───────────────────────────┐
 * │ A ficha é de LEITURA: os campos dela são texto, não controle, e título de bloco não tem papel    │
 * │ acessível. Não existe `heading` nem `button` para apontar no meio de "Trabalho e cadastro". Como │
 * │ o que o artigo ensina é o BLOCO (o mapa, não o clique), a seta aponta a seção inteira, casada    │
 * │ pelo título que está dentro dela. Título que a tela deixar de escrever faz o motor falhar, que é │
 * │ o detector de artigo velho funcionando.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';
const PAINEL = 'div[role="dialog"] .panel';
/** A linha COMPLETA do arnês (nome sintético, declarado na allowlist) e o olho dentro dela. */
const OLHO_DA_LINHA_SINTETICA = '.row:has-text("SIMULADO ALFA") button[title="Ver ficha"]';
/** Uma seção de bloco da ficha, casada pelo título que ela escreve. */
const bloco = (titulo: string) => `${PAINEL} section:has-text("${titulo}")`;

export const roteiro: Roteiro = {
  slug: "ler-a-ficha-da-admissao",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" },
    // Espera a lista recortar antes de procurar a linha: a busca da tela é atrasada de propósito, e
    // o motor espera 600ms por gesto. Sem este gesto, o clique disputa com a consulta.
    { acao: "rolarAte", alvo: { papel: "button", nome: "Candidato", texto: "" } },
    { acao: "clicar", alvo: { seletor: OLHO_DA_LINHA_SINTETICA, texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-ficha-topo.png",
      legenda: "Passo 2: o topo da ficha e o bloco Dados pessoais.",
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        { papel: "button", nome: "Fechar", texto: "Saia por aqui ou pelo Esc", lado: "abaixo" },
        {
          seletor: bloco("Dados pessoais"),
          texto: "Bloco 1: quem é a pessoa",
          forma: "retangulo",
          lado: "direita",
        },
        {
          papel: "button",
          nome: "Editar uniforme",
          texto: "Corrija o tamanho por aqui",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "02-ficha-trabalho-e-exame.png",
      legenda: "Passo 6: os blocos Trabalho e cadastro e Exame admissional.",
      recorte: { seletor: PAINEL, texto: "" },
      preparo: [{ acao: "rolarAte", alvo: { seletor: bloco("Exame admissional"), texto: "" } }],
      alvos: [
        {
          seletor: bloco("Trabalho e cadastro"),
          texto: "Bloco 2: o que a folha usa",
          forma: "retangulo",
          lado: "direita",
        },
        {
          seletor: bloco("Exame admissional"),
          texto: "Bloco 3: exame e atestado",
          forma: "retangulo",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "03-ficha-frentes-e-vt.png",
      legenda: "Passo 8: os blocos Status das frentes e Formulário de VT.",
      recorte: { seletor: PAINEL, texto: "" },
      preparo: [{ acao: "rolarAte", alvo: { papel: "button", nome: "Gerar link do VT", texto: "" } }],
      alvos: [
        {
          seletor: bloco("Status das frentes"),
          texto: "Bloco 4: onde a admissão está",
          forma: "retangulo",
          lado: "direita",
        },
        {
          papel: "button",
          nome: "Gerar link do VT",
          texto: "O link do vale-transporte",
          lado: "abaixo",
        },
      ],
    },
  ],
};
