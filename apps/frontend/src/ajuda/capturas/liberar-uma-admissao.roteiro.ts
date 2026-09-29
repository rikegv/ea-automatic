/**
 * ROTEIRO DE CAPTURA: "Liberar Uma Admissão".
 *
 * ┌─ A LIBERAÇÃO ESTÁ ENTRE AS TELAS QUE **NÃO PODEM** VIRAR IMAGEM INTEIRA ─────────────────────┐
 * │ A fila mostra nome, CPF, telefone e nascimento de todo mundo que está esperando. A imagem 1      │
 * │ recorta o CARTÃO DA TABELA e as imagens 2 e 3 recortam o PAINEL DO DIÁLOGO, e o gate de dado     │
 * │ pessoal audita DENTRO da caixa, nunca antes dela.                                              │
 * │                                                                                                │
 * │ O recorte aponta o `.panel`, e NÃO o `role="dialog"`: o papel de diálogo mora no véu que cobre a │
 * │ tela inteira, então recortar por ele seria a tela inteira com outro nome.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE OS SELETORES DO MODAL SÃO ESCOPADOS AO DIÁLOGO, e isto foi MEDIDO ──────────────────┐
 * │ `getByRole("button", { name: "Cliente" })` casa DOIS elementos nesta tela: o seletor do modal e o │
 * │ botão de ORDENAÇÃO do cabeçalho da coluna Cliente (§A.29, `ColunaOrdenavel` desenha um botão      │
 * │ dentro do `th`). Como o localizador usa o PRIMEIRO, sem escopo a seta apontaria o cabeçalho da    │
 * │ tabela, atrás do véu, e o print sairia com a marcação no lugar errado sem nada falhar.           │
 * │ Medido na homologação em 28/09/2026: 2 casamentos.                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UM PASSO PODE APARECER NO MEIO, E ELE DEPENDE DO DADO ──────────────────────────────────────┐
 * │ Quando a Sala de Espera acha registro parecido com o candidato, a janela "Vincular À Sala De     │
 * │ Espera" abre ANTES da liberação. Medido com a primeira linha da fila da homologação: não abriu.   │
 * │ Abrindo, o preparo falha em voz alta (o seletor do modal de liberação não existe ainda), que é o  │
 * │ comportamento certo de uma barreira: o conserto é acrescentar o "Seguir sem vincular" ao preparo, │
 * │ nunca capturar uma tela que não é a do passo.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NADA É LIBERADO POR ESTE ROTEIRO: o preparo abre a janela e para. NENHUM PNG é gravado aqui.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * ─ O PRIMEIRO GESTO É UMA ESPERA, E ELA NÃO É SUPERSTIÇÃO ──────────────────────────────────────
 *
 * A casca autenticada renderiza "Carregando…" enquanto a sessão é resolvida (`app/(app)/layout.tsx`),
 * e nesse instante NENHUM campo da tela existe ainda. O motor espera 1200ms depois do `networkidle`;
 * quando a resolução passa disso, o primeiro gesto falha como "a tela mudou", que é a mensagem do
 * detector de artigo velho, e manda procurar defeito num roteiro que está certo.
 *
 * `main` existe nos DOIS estados (ele é quem escreve o "Carregando…"), então rolar até ele é a espera
 * mais barata que não pode falhar por ausência: ela vale os 600ms que o motor dá a cada gesto.
 * Medido em 28/09/2026, com dois roteiros deste lote falhando exatamente aí.
 */
const ESPERAR_A_CASCA: GestoDePreparo = { acao: "rolarAte", alvo: { seletor: "main", texto: "" } };

/** O cartão que embrulha a tabela da fila. Recorte da imagem 1. */
const CARTAO_DA_FILA = ".glass:has(table.ds-table)";
const PAINEL_DO_DIALOGO = 'div[role="dialog"] .panel';
/** O seletor de dentro do modal, pelo rótulo acessível e ESCOPADO ao diálogo (ver o bloco acima). */
const campoDoModal = (rotulo: string) => `${PAINEL_DO_DIALOGO} button[aria-label="${rotulo}"]`;
/** O botão da PRIMEIRA linha da fila. A ordem é a da tela, e o artigo não depende de quem é. */
const ABRIR_A_LIBERACAO: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: /Liberar Admissão/, texto: "" },
};

export const roteiro: Roteiro = {
  slug: "liberar-uma-admissao",
  url: "/liberacao",
  preparo: [ESPERAR_A_CASCA],
  capturas: [
    {
      arquivo: "01-fila-aguardando.png",
      legenda: "Passo 1: a aba Aguardando, com a fila de pré-admissões.",
      recorte: { seletor: CARTAO_DA_FILA, texto: "" },
      alvos: [
        {
          seletor: 'th:has-text("Parado (dias)")',
          texto: "Quem espera há mais tempo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /Liberar Admissão/,
          texto: "Abre a liberação da linha",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-janela-de-liberacao.png",
      legenda: "Passo 6: a janela de liberação, com cliente, cargo e os campos da folha.",
      recorte: { seletor: PAINEL_DO_DIALOGO, texto: "" },
      preparo: [ABRIR_A_LIBERACAO],
      alvos: [
        {
          seletor: campoDoModal("Cliente"),
          texto: "1. Escolha o cliente",
          lado: "direita",
        },
        {
          seletor: campoDoModal("Cargo"),
          texto: "2. Escolha o cargo",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "03-botao-liberar.png",
      legenda: "Passo 11: o rodapé da janela, com Liberar, Cancelar e Recusar.",
      recorte: { seletor: PAINEL_DO_DIALOGO, texto: "" },
      preparo: [
        ABRIR_A_LIBERACAO,
        { acao: "rolarAte", alvo: { seletor: `${PAINEL_DO_DIALOGO} button:text-is("Liberar")`, texto: "" } },
      ],
      alvos: [
        {
          seletor: `${PAINEL_DO_DIALOGO} button:text-is("Liberar")`,
          texto: "Manda para a esteira",
          lado: "acima",
        },
        {
          papel: "button",
          nome: "Recusar",
          texto: "Só Master ou Super Admin",
          lado: "acima",
        },
      ],
    },
  ],
};
