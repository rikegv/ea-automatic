import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA EXAME: ABRIR O ASO QUE JÁ ESTÁ ANEXADO.
 *
 * ┌─ POR QUE ISTO É PEÇA PRÓPRIA, E NÃO UM PASSO DO ARTIGO DE ANEXAR ────────────────────────────┐
 * │ `anexar-o-aso-no-exame` ensina o envio. Quem precisa ABRIR o documento normalmente não está      │
 * │ enviando nada: está conferindo um veredito que discorda do que ele leu no papel, ou refazendo a  │
 * │ conta de um atestado que chegou por outra pessoa. É outro momento, com outra pergunta, e o botão │
 * │ é outro, o do olho ao lado do botão de anexar.                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ TRÊS COISAS MEDIDAS NO CÓDIGO, e sem elas o artigo mandaria caçar botão que não existe ─────┐
 * │ 1. O OLHO SÓ APARECE COM ARQUIVO ANEXADO (`isExame && item.asoAnexado && item.               │
 * │    asoTipoDocumentoId`, em `app/(app)/esteira/page.tsx`). Sem arquivo não há o que abrir.      │
 * │ 2. O BLOCO DO ASO NA FICHA SÓ VEM PELA ABA EXAME: o modal recebe o estado do ASO apenas ali    │
 * │    (`asoAnexado={isExame ? ... : undefined}`), então a mesma ficha aberta por outra aba não     │
 * │    mostra o botão Ver ASO.                                                                     │
 * │ 3. O ARQUIVO ABRE EM OUTRA ABA DO NAVEGADOR (`apiOpenInline`, `lib/api.ts`, `window.open`),     │
 * │    e isso explica o caso em que "clicou e não aconteceu nada": o bloqueador de janelas barrou.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA PEÇA NÃO ENSINA anexar (artigo irmão) nem o veredito da inteligência artificial (artigo de
 * outra peça). Ela para na porta: onde clicar para ver o documento, e o que fazer quando ele já não
 * está mais disponível.
 *
 * SEM IMAGEM, E AQUI A PENDÊNCIA É DUPLA: a fila mostra gente e o documento é de saúde. A captura
 * está vetada pela auditoria de segurança, e o texto foi escrito para funcionar sem figura.
 *
 * §A.6, VALENDO DOBRADO: nenhum nome, nenhum resultado de exame e nenhum conteúdo de documento
 * aparece aqui. O que o artigo nomeia são botões.
 */
export const artigo: Artigo = {
  slug: "ver-o-aso-anexado",
  titulo: "Ver O ASO Anexado",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "Onde abrir o atestado do exame que já foi anexado: pelo olho da linha, na fila do Exame, e pelo botão Ver ASO na ficha da pessoa. E o que fazer quando o arquivo já não está mais disponível para visualização.",
  termos: [
    "ver aso",
    "abrir aso",
    "visualizar aso",
    "conferir atestado",
    "ler o atestado",
    "aso anexado",
    "onde esta o aso",
    "aso nao abre",
    "aso sumiu",
    "atestado no drive",
    "exame medico",
  ],
  preRequisitos: [
    "O atestado já precisa ter sido anexado. Enquanto não houver arquivo, não existe botão de visualizar.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba EXAME.",
      detalhe: "A visualização do atestado vive nesta aba, que é a fila do exame admissional.",
      controles: ["Esteira Admissional", "EXAME"],
    },
    {
      gesto: "Ache a linha da pessoa pela busca do topo.",
      detalhe:
        "Quem já foi concluído sai da fila normal, então para rever o atestado de alguém concluído use o indicador de aptas ou filtre pelo status de conclusão.",
    },
    {
      gesto: "Clique no ícone de olho que fica ao lado do botão do atestado.",
      detalhe:
        "Ele aparece só quando existe arquivo anexado. O atestado é arquivo único, então abre direto, sem lista para escolher, em outra aba do navegador.",
      controles: ["Visualizar o ASO anexado"],
    },
    {
      gesto: "Pela ficha da pessoa, clique no olho da coluna Ações e procure o bloco do exame.",
      detalhe:
        "A ficha mostra a etiqueta do atestado e, ao lado dela, o botão de abrir. Este bloco aparece quando a ficha é aberta pela aba do Exame.",
      controles: ["Ver ASO", "Abrindo…"],
    },
    {
      gesto: "Não abrindo, confira se o navegador barrou a nova aba.",
      detalhe:
        "O documento abre em outra aba. Bloqueador de janelas pode impedir: libere as janelas para este endereço e clique de novo.",
    },
    {
      gesto: "Quando o aviso disser que o arquivo já não está disponível, procure o prontuário.",
      detalhe:
        "O arquivo fica visível por tempo limitado depois da coleta e some quando a régua de documentos fecha. O documento arquivado continua no prontuário, pelo link do Drive na ficha.",
      controles: ["Prontuário no Drive"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Não existe ícone de olho ao lado do botão do atestado.",
      acao: "Nenhum arquivo foi anexado nesta admissão ainda. O envio é o artigo de anexar o atestado na aba do Exame.",
    },
    {
      sintoma: "A tela avisa ASO não está mais disponível para visualização.",
      acao: "Não é erro: é estado normal do fluxo. O arquivo tem prazo curto de visualização e é descartado quando a régua fecha. Abra o prontuário no Drive pela ficha para ver o documento arquivado.",
    },
    {
      sintoma: "A tela mostra Falha ao abrir o ASO.",
      acao: "A abertura não voltou. Tente outra vez e, repetindo, recarregue a página. Nada do que estava anexado se perde nisso.",
    },
    {
      sintoma: "Cliquei e nada aconteceu na tela.",
      acao: "O documento abre em outra aba do navegador. Confira se ela foi bloqueada, libere as janelas para este endereço e clique de novo.",
    },
    {
      sintoma: "Abri a ficha pela aba do Cadastro e não achei o botão de ver o atestado.",
      acao: "O bloco do atestado vem na ficha aberta pela aba do Exame. Volte àquela aba, ache a pessoa e abra a ficha por lá.",
    },
    {
      sintoma: "Quero baixar o arquivo para mandar para alguém.",
      acao: "Use o prontuário no Drive, que é onde o documento fica guardado. A visualização da fila serve para conferir na hora, não para distribuir o arquivo.",
    },
  ],
  regras: [
    "O botão de visualizar só existe quando há arquivo anexado.",
    "O atestado é arquivo único: ele abre direto, sem lista de páginas ou de frente e verso.",
    "O arquivo é servido pelo próprio sistema, e não por link público: quem não tem acesso à tela não abre o documento.",
    "A visualização tem prazo: passado o prazo, ou fechada a régua de documentos, o arquivo sai e a tela avisa. É estado normal, não falha.",
    "O documento arquivado continua no prontuário do Drive, pelo link da ficha.",
    "O bloco do atestado na ficha aparece quando ela é aberta pela aba do Exame.",
  ],
  relacionados: [
    "anexar-o-aso-no-exame",
    "o-veredito-do-aso-pela-ia-na-ficha",
    "liberar-apto-sem-aso-validado",
    "ler-a-ficha-da-admissao",
    "visualizar-um-documento-da-admissao",
    "abrir-o-prontuario-no-drive",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/frontend/src/lib/api.ts",
    "apps/backend/src/esteira/esteira.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
