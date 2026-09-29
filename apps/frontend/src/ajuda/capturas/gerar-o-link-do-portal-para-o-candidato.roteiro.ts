/**
 * ROTEIRO DE CAPTURA: "Gerar O Link Do Portal Para O Candidato".
 *
 * ┌─ NENHUMA IMAGEM DESTE ROTEIRO MOSTRA UM LINK, E ISSO É DESENHO, NÃO SORTE ──────────────────┐
 * │ A URL do portal é CREDENCIAL de acesso aos documentos de uma pessoa, e print vai para o          │
 * │ repositório, que guarda para sempre. Por isso NENHUM preparo aqui clica no botão que EMITE: as    │
 * │ três imagens param antes da emissão, mostrando o caminho (a barra do painel, a janela do primeiro  │
 * │ envio e os botões da linha) e nunca o resultado. Os passos que falam do link já copiado ficam sem  │
 * │ imagem de propósito, e o texto deles é autossuficiente.                                           │
 * │                                                                                                  │
 * │ NÃO CLICAR TAMBÉM EVITA UM EFEITO COLATERAL REAL: emitir revoga o link anterior. Um roteiro que   │
 * │ emitisse a cada rodada de captura derrubaria o acesso de um candidato de verdade na homologação.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS BOTÕES DA LINHA CARREGAM O NOME NO RÓTULO ACESSÍVEL ───────────────────────────────┐
 * │ Eles se anunciam como "Gerar link do portal para <NOME>" e "Enviar o link do portal por e-mail   │
 * │ para <NOME>", então os alvos casam só o COMEÇO: nenhum nome entra neste arquivo (§A.6), e o       │
 * │ localizador continua falhando em voz alta se o rótulo mudar.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ÚNICA CAPTURA COM `PODE_SER_VAZIA`, E O VAZIO ALI É O ESTADO CERTO DA TELA ───────────────┐
 * │ A janela "Enviar Link Do Portal" lista SÓ quem ainda NÃO tem link nenhum. Na homologação toda      │
 * │ admissão viva já tem o seu, então a janela abre dizendo "Nenhuma admissão viva está sem link do    │
 * │ portal", e isso é a tela FUNCIONANDO, não fila que ninguém povoou: esvaziar aquela lista é         │
 * │ exatamente o objetivo do trabalho que o artigo ensina.                                            │
 * │                                                                                                   │
 * │ MEDIDO ANTES DE DECLARAR: `pnpm ajuda:conferir` recusou o print com "CAPTURA RECUSADA: LISTA       │
 * │ VAZIA, 0 lista(s), 0 linha(s) de dado", e a recusa estava CERTA como padrão. A declaração é ATO    │
 * │ ESCRITO, aparece no diff e vale SÓ para esta imagem: as outras duas deste roteiro seguem no lado   │
 * │ estrito, e um print de fila vazia por falta de arnês continuaria sendo recusado, que é o que se    │
 * │ quer (print vazio PARECE pronto, e isso é pior do que print faltando).                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';
const TABELA = "table.ds-table";

export const roteiro: Roteiro = {
  slug: "gerar-o-link-do-portal-para-o-candidato",
  url: "/admin/portal-links",
  capturas: [
    {
      arquivo: "01-barra-do-painel.png",
      legenda: "Passo 1: a barra do Gerenciador Do Portal, com a busca e os dois botões.",
      alvos: [
        {
          papel: "button",
          nome: "Copiar ou enviar link",
          texto: "2. A porta do primeiro link",
          forma: "elipse",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Painel Do Portal",
          texto: "1. A vista do time",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-janela-do-primeiro-envio.png",
      legenda: "Passo 2: a janela Enviar Link Do Portal, com os dois caminhos por pessoa.",
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Copiar ou enviar link", texto: "" } },
      ],
      recorte: { seletor: PAINEL, texto: "" },
      /**
       * O VAZIO AQUI É O ESTADO CORRETO DA TELA, e não fila sem arnês: esta janela mostra só quem
       * ainda não tem link, e zerar essa lista é o objetivo do trabalho. Ver o bloco do cabeçalho.
       * Declarado SÓ nesta captura; as outras duas seguem exigindo linha.
       */
      linhasEsperadas: "PODE_SER_VAZIA",
      alvos: [
        {
          papel: "heading",
          nome: "Enviar Link Do Portal",
          texto: "Só quem ainda não tem link",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          // `type="search"` tem papel `searchbox`, que NÃO está no vocabulário de `Alvo`, e o motor
          // recusou o `textbox` com ALVO NÃO ENCONTRADO (medido). A saída é o `aria-label`, que é o
          // rótulo acessível e não uma classe: ele falha em voz alta no dia em que o rótulo mudar.
          seletor: 'input[aria-label="Buscar por nome do candidato"]',
          texto: "3. Busque pelo nome",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-acoes-da-linha.png",
      legenda: "Passo 4: os quatro botões da coluna Ações, na linha do candidato.",
      recorte: { seletor: TABELA, texto: "" },
      /**
       * ESTADO DECLARADO EM DOIS NÍVEIS, e o primeiro é a condição de a tabela EXISTIR.
       *
       * Esta tela tem duas VISTAS ("Painel Do Portal" e "Pedidos De Ajuda Para Entrar"), e a tabela
       * do painel simplesmente não é montada na segunda. Uma imagem de linha sem declarar a vista
       * depende de nenhuma imagem anterior ter trocado de vista, e neste roteiro há justamente uma
       * que troca. Declarada, a ordem de execução deixa de importar.
       *
       * A ABA TAMBÉM ENTRA, pelo mesmo motivo: "Em Andamento" é o padrão, mas padrão não é
       * declaração, e quem lê o roteiro precisa saber QUAL fila a imagem mostra. Reclicar a aba já
       * ativa é no-op na tela, então declarar não custa nada e fecha o buraco.
       *
       * O QUE O PREPARO **NÃO** GARANTE: que a fila tenha gente. Quem recusa a tabela sem linha é o
       * detector de LISTA VAZIA, e `linhasEsperadas` fica AUSENTE de propósito: fila vazia de coleta
       * é falta de dado, e não o estado correto da tela, ao contrário da janela de primeiro envio
       * deste mesmo roteiro, que é o único lugar onde a exceção é honesta.
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Painel Do Portal", texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Em Andamento", texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Link", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: /^Gerar link do portal para/,
          texto: "4. Gera e mostra para copiar",
          forma: "elipse",
          lado: "acima",
        },
        {
          papel: "button",
          nome: /^Enviar o link do portal por e-mail para/,
          texto: "Manda por e-mail",
          forma: "elipse",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Link",
          texto: "7. O estado do acesso",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
  ],
};
