import type { Artigo } from "../../tipos";

/**
 * OS TRÊS ESTADOS DE EXIGÊNCIA, e a regra que esta peça existe para fixar.
 *
 * A REGRA CENTRAL: a exigência vive no PAR de cliente e cargo, nunca no documento. O catálogo guarda
 * só o NOME; se o documento é obrigatório, não obrigatório ou facultativo é decisão do par. Confundir
 * as duas coisas é o erro mais caro desta tela, porque leva a pessoa a procurar no lugar errado.
 *
 * O EFEITO DE CADA ESTADO foi lido no código que monta o checklist da admissão, e não suposto:
 *   - obrigatório e facultativo entram no checklist da admissão;
 *   - não obrigatório não entra;
 *   - só o obrigatório conta na completude, que é o que fecha a auditoria.
 *
 * O QUE ELA NÃO COBRE: cadastrar, renomear ou inativar o documento no catálogo, que tem ficha
 * própria, e nenhum documento é citado pelo nome, porque o conteúdo da régua muda por dado.
 */
export const artigo: Artigo = {
  slug: "definir-a-exigencia-de-cada-documento",
  titulo: "Definir A Exigência De Cada Documento",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regua"],
  menus: ["regua"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "regua-e-documentos",
  resumo:
    "O que significa cada um dos três estados de exigência, como escolhê-los documento a documento e por que a exigência pertence ao par de cliente e cargo, e não ao documento.",
  termos: [
    "obrigatorio",
    "nao obrigatorio",
    "facultativo",
    "exigencia do documento",
    "documento cobrado",
    "documento opcional",
    "documento nao aparece na admissao",
    "mudar exigencia",
    "checklist do cargo",
  ],
  preRequisitos: [
    "Ter o par de cliente e cargo escolhido nos seletores: sem ele a lista fica bloqueada.",
  ],
  passos: [
    {
      gesto: "Na Régua Documental, escolha o cliente e o cargo.",
      controles: ["Régua Documental", "Selecione o cliente…", "Selecione o cargo…"],
    },
    {
      gesto: "Percorra a lista de documentos e escolha a exigência de cada um na coluna ao lado.",
      detalhe:
        "Obrigatório é cobrado e conta como pendência enquanto não for entregue. Facultativo entra no checklist da admissão e é aceito se vier, sem contar como pendência. Não obrigatório não entra no checklist daquele par.",
      controles: ["Documento", "Exigência", "Obrigatório", "Não obrigatório", "Facultativo"],
    },
    {
      gesto: "Clique em Salvar régua.",
      detalhe:
        "Depois de salvar, a lista se reorganiza com os obrigatórios em cima, em ordem alfabética dentro de cada grupo.",
      controles: ["Salvar régua"],
    },
    {
      gesto: "Para conferir outro cargo do mesmo cliente, troque só o seletor de cargo.",
      detalhe:
        "A exigência é do par, então o mesmo documento pode ser obrigatório para um cargo e não ser para outro dentro do mesmo cliente.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Mudei a exigência e a lista continua na mesma ordem.",
      acao: "A ordem é congelada durante a edição de propósito, para a linha não pular embaixo do seu cursor. Ela se reorganiza quando você salva.",
    },
    {
      sintoma: "Procurei a exigência no cadastro do documento e não achei.",
      acao: "Ela não está lá. O cadastro do documento guarda só o nome; a exigência é escolhida aqui, dentro do par de cliente e cargo.",
    },
    {
      sintoma: "Um documento sumiu da lista de edição.",
      acao: "Ele foi inativado no catálogo. As réguas já salvas que o exigem não são alteradas, então as admissões em andamento seguem cobrando ele.",
    },
    {
      sintoma: "O documento não aparece no checklist da admissão.",
      acao: "Confira a exigência dele naquele par: documento marcado como não obrigatório não entra no checklist.",
    },
  ],
  regras: [
    "A exigência vive no par de cliente e cargo, nunca no documento: o catálogo guarda só o nome.",
    "Obrigatório entra no checklist e conta como pendência enquanto não é entregue.",
    "Facultativo entra no checklist e é aceito se vier, sem contar como pendência.",
    "Não obrigatório não entra no checklist daquele par.",
    "O mesmo documento pode ser obrigatório para um cargo e não ser para outro dentro do mesmo cliente.",
    "A completude que fecha a auditoria olha só os obrigatórios.",
  ],
  relacionados: [
    "cadastrar-a-regua-de-um-cliente-e-cargo",
    "aplicar-os-documentos-padrao",
    "inativar-a-regua-de-um-cliente",
    "o-catalogo-de-documentos-da-regua",
    "ler-a-regua-obrigatoria-da-admissao",
    "auditar-os-documentos-da-admissao",
    "desligar-uma-pendencia-obrigatoria-de-um-cliente",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regua/page.tsx",
    "apps/backend/src/admin/regua/regua.service.ts",
    "apps/backend/src/domain/regua.ts",
  ],
  revisadoEm: "2026-09-30",
};
