/**
 * ROTEIRO DE CAPTURA: "Salvar Com Campo Obrigatório Vazio".
 *
 * ┌─ O CLIQUE NO "CONFIRMAR ADMISSÃO" NÃO CRIA NADA, E ISSO FOI MEDIDO NO CÓDIGO ────────────────┐
 * │ A janela que este artigo ensina só existe DEPOIS do clique, então o roteiro precisa clicar. Ele  │
 * │ não grava admissão porque `create` (`admissoes.service.ts`) valida as pendências ANTES de abrir a │
 * │ transação: havendo campo obrigatório vazio e sem aceite, ele devolve a lista e nada é escrito.   │
 * │                                                                                                │
 * │ E o preparo GARANTE que haja pendência: ele não preenche NENHUM campo da etapa da folha (salário, │
 * │ escala, benefícios, centro de custo, gestor), além de Setor e Uniforme, que não existem no wizard │
 * │ e são cobrados pela régua. Um roteiro que preenchesse tudo criaria uma admissão de verdade a cada │
 * │ rodada do detector de artigo velho.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O NOME E O CPF DIGITADOS SÃO OS DA LINHA SINTÉTICA DO ARNÊS ────────────────────────────────┐
 * │ O botão só habilita com nome, CPF válido e sexo, então há o que digitar, e o que se digita       │
 * │ aparece no print. "SIMULADO ALFA" e `99900000188` estão DECLARADOS em                           │
 * │ `tools/ajuda/allowlist-arnes.json`: nome inventado por um roteiro pode coincidir com gente de     │
 * │ verdade, e CPF inventado pode ser de alguém.                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RECORTE DA IMAGEM 2 É O PAINEL DO DIÁLOGO, e não o `role="dialog"`: o papel de diálogo mora no
 * véu que cobre a tela inteira, então recortar por ele seria a tela inteira com outro nome.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
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

const PAINEL = ".panel";
const PAINEL_DO_DIALOGO = 'div[role="dialog"] .panel';
const CPF_DO_ARNES = "99900000188";
const NOME_DO_ARNES = "SIMULADO ALFA";

/** Até a terceira etapa, SEM preencher nada da folha: é a ausência que produz a janela do artigo. */
const CAMINHO_ATE_A_ETAPA_DO_CANDIDATO: GestoDePreparo[] = [
  ESPERAR_A_CASCA,
  {
    acao: "digitar",
    alvo: { papel: "textbox", nome: /Buscar cliente/, texto: "" },
    valor: "51726",
  },
  // ESPERA A BUSCA VOLTAR antes de procurar o resultado: a consulta de cliente é atrasada de
  // propósito (300ms) e o motor espera 600ms por gesto, então sem este gesto o clique disputa com a
  // resposta e o resultado ainda não existe. Medido em 28/09/2026: o preparo falhou exatamente aqui.
  { acao: "rolarAte", alvo: { papel: "textbox", nome: /Buscar cliente/, texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: /Código 51726/, texto: "" } },
  // E espera o estado do wizard assentar antes do Próximo: ele nasce DESABILITADO e só habilita
  // depois de o cliente entrar no estado, então clicar cedo dá timeout de botão travado.
  { acao: "rolarAte", alvo: { papel: "button", nome: /Próximo/, texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: /Próximo/, texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: "Cargo", texto: "" } },
  { acao: "clicar", alvo: { seletor: 'div[role="listbox"] button[role="option"]', texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: /Próximo/, texto: "" } },
];

/** O mínimo que habilita o botão: nome, CPF válido e sexo. Nada além disso. */
const IDENTIDADE_MINIMA: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { papel: "textbox", nome: /Nome completo/, texto: "" },
    valor: NOME_DO_ARNES,
  },
  { acao: "digitar", alvo: { papel: "textbox", nome: /CPF/, texto: "" }, valor: CPF_DO_ARNES },
  { acao: "clicar", alvo: { papel: "button", nome: "Sexo do candidato", texto: "" } },
  { acao: "clicar", alvo: { seletor: 'div[role="listbox"] button[role="option"]', texto: "" } },
];

export const roteiro: Roteiro = {
  slug: "salvar-com-campo-obrigatorio-vazio",
  url: "/nova",
  arnes: "arnes-seed-manual",
  preparo: [...CAMINHO_ATE_A_ETAPA_DO_CANDIDATO, ...IDENTIDADE_MINIMA],
  capturas: [
    {
      arquivo: "01-confirmar-admissao.png",
      legenda: "Passo 1: o botão que fecha o cadastro, na última etapa do wizard.",
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: /Confirmar admissão/,
          texto: "Clique aqui com o que você tem",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "02-janela-de-aceite.png",
      legenda: "Passo 2: a janela que lista os campos obrigatórios vazios.",
      recorte: { seletor: PAINEL_DO_DIALOGO, texto: "" },
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: /Confirmar admissão/, texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: /Estou ciente, criar/,
          texto: "Cria com a pendência marcada",
          lado: "acima",
        },
        {
          papel: "button",
          nome: /Cancelar/,
          texto: "Volta para preencher",
          lado: "acima",
        },
      ],
    },
  ],
};
