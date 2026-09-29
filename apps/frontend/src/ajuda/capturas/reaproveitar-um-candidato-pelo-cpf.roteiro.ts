/**
 * ROTEIRO DE CAPTURA: "Reaproveitar Um Candidato Pelo CPF".
 *
 * ┌─ O CPF DIGITADO É O DO ARNÊS, E ESSA É A ÚNICA ESCOLHA POSSÍVEL AQUI ────────────────────────┐
 * │ O artigo ensina o cartão que só aparece quando o CPF JÁ EXISTE na base, então o roteiro tem de  │
 * │ digitar um CPF existente, e o cartão devolve o NOME de quem é aquele CPF. Com CPF de candidato   │
 * │ qualquer, o print sairia com nome e documento de uma pessoa dentro.                            │
 * │                                                                                                │
 * │ Por isso o roteiro usa `99900000188`, da linha sintética do `arnes-seed-manual`, DECLARADO em    │
 * │ `tools/ajuda/allowlist-arnes.json` junto do nome dela. É a diferença entre "passou no gate por   │
 * │ sorte" e "passou porque foi declarado": o inventário do que pode aparecer em print é revogável,  │
 * │ e o gate continua auditando o recorte.                                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O WIZARD NÃO TEM ENDEREÇO PARA A TERCEIRA ETAPA, ENTÃO O PREPARO ANDA ATÉ LÁ ───────────────┐
 * │ A etapa Candidato não é uma rota: ela é o estado 3 do mesmo formulário. O preparo do ROTEIRO    │
 * │ (não o da imagem) faz o caminho inteiro, porque as DUAS imagens partem do mesmo ponto, e o motor │
 * │ reaplica o preparo do roteiro antes de cada uma.                                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NADA É GRAVADO: o preparo para antes do "Confirmar admissão". NENHUM PNG é gravado por este
 * arquivo; ele descreve a captura, quem executa é o motor.
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
/** O CPF da linha sintética ALFA do arnês do manual, declarado na allowlist. */
const CPF_DO_ARNES = "99900000188";
/** Cliente com o maior número de cargos com régua na homologação, casado pelo código. */
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
  { acao: "digitar", alvo: { papel: "textbox", nome: /CPF/, texto: "" }, valor: CPF_DO_ARNES },
];

export const roteiro: Roteiro = {
  slug: "reaproveitar-um-candidato-pelo-cpf",
  url: "/nova",
  arnes: "arnes-seed-manual",
  preparo: CAMINHO_ATE_A_ETAPA_DO_CANDIDATO,
  capturas: [
    {
      arquivo: "01-cpf-ja-cadastrado.png",
      legenda: "Passo 2: o cartão que aparece quando o CPF digitado já existe na base.",
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        { papel: "textbox", nome: /CPF/, texto: "1. Digite o CPF", lado: "direita" },
        {
          seletor: 'div.font-semibold:text-is("CPF já cadastrado")',
          texto: "2. O aviso, que não é erro",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /Reaproveitar dados/,
          texto: "3. Traz nome, e-mail e telefone",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-dados-reaproveitados.png",
      legenda: "Passo 3: a etiqueta de confirmação depois do reaproveitamento.",
      recorte: { seletor: PAINEL, texto: "" },
      /* DUAS ESPERAS ANTES DO CLIQUE: a consulta do CPF é atrasada (350ms) e o cartão só nasce
         depois da resposta. Sem elas, o clique chega antes do botão existir, e o preparo falha como
         "a tela mudou". Medido em 28/09/2026. */
      preparo: [
        { acao: "rolarAte", alvo: { papel: "textbox", nome: /CPF/, texto: "" } },
        { acao: "rolarAte", alvo: { papel: "textbox", nome: /CPF/, texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: /Reaproveitar dados/, texto: "" } },
      ],
      alvos: [
        {
          seletor: '.pill:has-text("Dados reaproveitados")',
          texto: "Os dados vieram",
          lado: "esquerda",
        },
        {
          papel: "textbox",
          nome: /Nome completo/,
          texto: "Confira o nome que veio",
          lado: "abaixo",
        },
      ],
    },
  ],
};
