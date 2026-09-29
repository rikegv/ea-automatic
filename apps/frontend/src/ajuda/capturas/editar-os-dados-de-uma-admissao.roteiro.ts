/**
 * ROTEIRO DE CAPTURA: "Editar Os Dados De Uma Admissão".
 *
 * ┌─ AS MESMAS DUAS BARREIRAS DA FICHA, PELO MESMO MOTIVO ───────────────────────────────────────┐
 * │ O formulário de edição mostra nome, CPF, telefone, e-mail e nascimento, então as três imagens    │
 * │ recortam (a tabela na primeira, o painel da janela nas outras duas) e o preparo deixa na lista    │
 * │ apenas as linhas sintéticas do arnês. O gate de dado pessoal audita DENTRO da caixa recortada.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LÁPIS É PROCURADO DENTRO DA LINHA SINTÉTICA, e é isso que impede a janela errada ─────────┐
 * │ O nome acessível do lápis é "Editar " mais o nome da pessoa da linha, que é justamente o que não │
 * │ pode entrar neste arquivo (§A.6). Então o localizador casa o `title` fixo do botão, escopado à   │
 * │ linha da conta sintética: se a busca ainda não tiver recortado a lista, o preparo FALHA em vez de │
 * │ abrir o formulário de uma pessoa de verdade.                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A LINHA ESCOLHIDA É A QUE TEM PENDÊNCIA, E A ESCOLHA É DELIBERADA ──────────────────────────┐
 * │ O artigo ensina a corrigir dado, então o formulário mais útil de fotografar é o de uma admissão  │
 * │ com campo em branco. A linha completa serviria igual para o enquadramento, e ensinaria menos.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS CAMPOS DE TEXTO DESTE FORMULÁRIO NÃO TÊM NOME ACESSÍVEL (o rótulo é um texto ao lado, não um
 * rótulo ligado ao campo), então as setas apontam o que TEM papel: o CPF em leitura (que declara
 * `aria-label`), os seletores e os dois botões do rodapé. Apontar o bloco inteiro resolve o resto, e é
 * o que o artigo ensina de fato: em que bloco cada coisa mora.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';
const PAINEL = 'div[role="dialog"] .panel';
const TABELA = ".list";
/** O lápis da linha do arnês que TEM pendência obrigatória (nome sintético, declarado na allowlist). */
const LAPIS_DA_LINHA_SINTETICA = '.row:has-text("SIMULADO BRAVO") button[title="Editar"]';
const bloco = (titulo: string) => `${PAINEL} section:has-text("${titulo}")`;

export const roteiro: Roteiro = {
  slug: "editar-os-dados-de-uma-admissao",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" },
    { acao: "rolarAte", alvo: { papel: "button", nome: "Candidato", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-botao-editar.png",
      legenda: "Passo 1: o lápis da linha, que abre o formulário de edição.",
      recorte: { seletor: TABELA, texto: "" },
      alvos: [
        {
          seletor: `${TABELA} button[title="Editar"]`,
          texto: "1. Abra a edição",
          forma: "elipse",
          lado: "esquerda",
        },
        {
          seletor: `${TABELA} button[title="Ver ficha"]`,
          texto: "O olho é só leitura",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-formulario-de-edicao.png",
      legenda: "Passo 2: o formulário aberto, com o bloco Dados pessoais e o CPF em leitura.",
      preparo: [{ acao: "clicar", alvo: { seletor: LAPIS_DA_LINHA_SINTETICA, texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          seletor: bloco("Dados pessoais"),
          texto: "2. Corrija os dados da pessoa",
          forma: "retangulo",
          lado: "direita",
        },
        {
          papel: "textbox",
          nome: "CPF do candidato",
          texto: "O CPF não se edita",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-salvar-alteracoes.png",
      legenda: "Passo 5: o rodapé do formulário, com Cancelar e Salvar alterações.",
      preparo: [
        { acao: "clicar", alvo: { seletor: LAPIS_DA_LINHA_SINTETICA, texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Salvar alterações", texto: "" } },
      ],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Salvar alterações",
          texto: "5. Grave a correção",
          forma: "elipse",
          lado: "acima",
        },
        { papel: "button", nome: "Cancelar", texto: "Sai sem gravar nada", lado: "acima" },
      ],
    },
  ],
};
