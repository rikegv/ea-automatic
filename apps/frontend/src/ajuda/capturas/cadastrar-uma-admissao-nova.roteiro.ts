/**
 * ROTEIRO DE CAPTURA: "Cadastrar Uma Admissão Nova".
 *
 * ┌─ O WIZARD ESTÁ NA LISTA DAS TELAS QUE **NÃO PODEM** VIRAR IMAGEM INTEIRA ────────────────────┐
 * │ Ele tem CAMPO DE CPF, nome completo, telefone e e-mail do candidato na terceira etapa. As três  │
 * │ imagens recortam o PAINEL do cadastro, e o gate de dado pessoal audita DENTRO da caixa, que é a │
 * │ ordem que o bloco do `recorte` exige: recortar sem auditar o recorte só troca o vazamento grande │
 * │ por um pequeno.                                                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NADA AQUI CRIA ADMISSÃO, E ISSO É DESENHO DO ROTEIRO ──────────────────────────────────────┐
 * │ O preparo anda pelas três etapas e PARA antes do "Confirmar admissão". A tela de êxito ficou    │
 * │ sem print de propósito: fotografá-la exigiria GRAVAR uma admissão na homologação a cada rodada  │
 * │ do detector de artigo velho, e um roteiro que escreve no banco a cada conferência deixa de ser  │
 * │ detector e passa a ser gerador de sujeira. O passo do êxito é ensinado por texto.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CLIENTE DO PREPARO É ESCOLHIDO PELO CÓDIGO, e por três razões medidas ────────────────────┐
 * │ `51726` é o cliente com MAIS cargos com régua cadastrada na homologação (24), tem escala e      │
 * │ benefícios padrão preenchidos (então as sugestões que o artigo ensina aparecem) e o código casa  │
 * │ UM cliente só na busca, que aceita código, CNPJ, razão social e operação. Buscar por nome      │
 * │ traria vários e o clique cairia em qualquer um deles.                                          │
 * │                                                                                                │
 * │ Cliente é VOCABULÁRIO do sistema, não pessoa: o nome dele em print é dispensado pelo gate por   │
 * │ igualdade com o catálogo, e nenhum candidato é digitado por este roteiro.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
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

/** O painel do wizard. O recorte é ele: a tela inteira traria a barra lateral e o resto do app. */
const PAINEL = ".panel";
/** O cartão recolhível da régua, casado pelo título que ele escreve. */
const CHECKLIST = '.glass.p-4:has-text("Checklist da régua")';
/** O cliente do preparo, casado pelo CÓDIGO (a linha do resultado escreve "Código 51726"). */
const RESULTADO_DO_CLIENTE: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: /Código 51726/, texto: "" },
};
/**
 * ESPERA O ESTADO DO WIZARD ASSENTAR ANTES DO PRÓXIMO. O botão nasce DESABILITADO e só habilita
 * depois de o cliente (ou o cargo) entrar no estado da tela. O motor espera 600ms por gesto, e sem
 * este gesto a mais o clique chega antes e dá timeout de botão travado, com mensagem de alvo perdido.
 */
const PROXIMO: GestoDePreparo[] = [
  { acao: "rolarAte", alvo: { papel: "button", nome: /Próximo/, texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: /Próximo/, texto: "" } },
];
/**
 * O CARGO É ESCOLHIDO PELO PAPEL DA OPÇÃO, nunca pelo nome dela: o catálogo de cargos com régua é
 * vivo, e um roteiro que soubesse o nome do primeiro cargo quebraria na próxima régua cadastrada.
 */
const ESCOLHER_CARGO: GestoDePreparo[] = [
  { acao: "clicar", alvo: { papel: "button", nome: "Cargo", texto: "" } },
  { acao: "clicar", alvo: { seletor: 'div[role="listbox"] button[role="option"]', texto: "" } },
];

export const roteiro: Roteiro = {
  slug: "cadastrar-uma-admissao-nova",
  url: "/nova",
  preparo: [
    ESPERAR_A_CASCA,
    {
      acao: "digitar",
      alvo: { papel: "textbox", nome: /Buscar cliente/, texto: "" },
      valor: "51726",
    },
  ],
  capturas: [
    {
      arquivo: "01-etapa-cliente.png",
      legenda: "Passo 1: a etapa Cliente, com a trilha das três etapas no topo.",
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "textbox",
          nome: /Buscar cliente/,
          texto: "1. Busque o cliente",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /Código 51726/,
          texto: "2. Clique no cliente certo",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-cargo-e-regua.png",
      legenda: "Passo 6: o cargo escolhido e o checklist da régua aberto.",
      recorte: { seletor: CHECKLIST, texto: "" },
      preparo: [
        RESULTADO_DO_CLIENTE,
        ...PROXIMO,
        ...ESCOLHER_CARGO,
        { acao: "clicar", alvo: { papel: "button", nome: /Ver documentos/, texto: "" } },
      ],
      alvos: [
        {
          seletor: `${CHECKLIST} .eyebrow`,
          texto: "O que será exigido",
          lado: "direita",
        },
        {
          papel: "button",
          nome: /Recolher/,
          texto: "Abre e fecha a lista",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "03-etapa-candidato.png",
      legenda: "Passo 10: a etapa Candidato, com o CPF conferido na hora.",
      recorte: { seletor: PAINEL, texto: "" },
      preparo: [RESULTADO_DO_CLIENTE, ...PROXIMO, ...ESCOLHER_CARGO, ...PROXIMO],
      alvos: [
        { papel: "textbox", nome: /CPF/, texto: "O CPF é conferido aqui", lado: "direita" },
        {
          papel: "button",
          nome: "Sexo do candidato",
          texto: "Define a régua do reservista",
          lado: "direita",
        },
        {
          papel: "button",
          nome: /Confirmar admissão/,
          texto: "Fecha o cadastro",
          lado: "acima",
        },
      ],
    },
  ],
};
