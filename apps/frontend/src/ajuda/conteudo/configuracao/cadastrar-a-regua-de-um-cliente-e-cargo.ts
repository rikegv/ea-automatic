import type { Artigo } from "../../tipos";

/**
 * A RÉGUA DE UM PAR: os dois seletores, o salvar e os dois painéis que organizam o trabalho.
 *
 * O QUE ELA COBRE: escolher cliente e cargo, salvar a régua daquele par, e usar o painel de clientes
 * sem régua como FILA (o cliente sai dela sozinho quando a régua é salva) e o painel de clientes com
 * régua para achar e editar o que já existe, cargo a cargo.
 *
 * O QUE ELA NÃO COBRE, e cada exclusão tem dono:
 *   - os três estados de exigência, que são a peça seguinte;
 *   - os documentos padrão, que são a peça de depois;
 *   - o CATÁLOGO de nomes de documento (criar, renomear, inativar), que tem ficha própria.
 *
 * NENHUM documento é citado pelo nome. O conteúdo da régua muda por dado, e nenhum detector de
 * manual velho pega mudança de dado: artigo que lista documento envelhece sozinho.
 */
export const artigo: Artigo = {
  slug: "cadastrar-a-regua-de-um-cliente-e-cargo",
  titulo: "Cadastrar A Régua De Um Cliente E Cargo",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regua"],
  menus: ["regua"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "regua-e-documentos",
  resumo:
    "Como montar o checklist de documentos de um par de cliente e cargo, e como usar o painel de clientes sem régua como fila de trabalho.",
  termos: [
    "cadastrar checklist",
    "regua documental",
    "checklist de documentos",
    "documento nao aparece na admissao",
    "quais documentos o cliente pede",
    "cliente sem regua",
    "trava o cargo na nova admissao",
    "montar regua",
    "regua por cargo",
  ],
  preRequisitos: [
    "Ter o cliente e o cargo já cadastrados: a régua resolve pelo par dos dois.",
  ],
  passos: [
    {
      gesto: "Abra a Régua Documental pelo Menu Gerencial.",
      controles: ["Régua Documental"],
    },
    {
      gesto: "Olhe o painel de clientes sem régua, no topo: ele é a sua fila de trabalho.",
      detalhe:
        "Ele lista os clientes que ainda não têm régua nenhuma. Clicar num deles já o coloca no seletor abaixo.",
      controles: ["Clientes sem régua cadastrada", "Cadastrar régua"],
    },
    {
      gesto: "Escolha o cliente e o cargo nos dois seletores.",
      detalhe:
        "Os dois têm busca. Enquanto os dois não estiverem escolhidos, a lista de documentos fica bloqueada para edição.",
      controles: ["Selecione o cliente…", "Selecione o cargo…"],
    },
    {
      gesto: "Defina a exigência de cada documento na lista abaixo.",
      detalhe:
        "A coluna de exigência tem um seletor por documento. O que cada estado significa está no artigo próprio.",
      controles: ["Documento", "Exigência"],
    },
    {
      gesto: "Clique em Salvar régua.",
      detalhe:
        "O cliente sai do painel de clientes sem régua e passa a aparecer no painel dos que já têm.",
      controles: ["Salvar régua"],
    },
    {
      gesto:
        "Para conferir ou ajustar depois, procure o cliente no painel de clientes com régua e clique nele para ver os cargos.",
      detalhe:
        "Cada cargo cadastrado tem um botão que carrega a régua daquele cargo nos seletores acima.",
      controles: ["Clientes com régua cadastrada", "Buscar cliente…", "Editar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela avisa que é preciso cadastrar ao menos um cliente e um cargo.",
      acao: "Os dois seletores dependem dos cadastros de cliente e de cargo. Cadastre o que falta nas telas correspondentes e volte aqui.",
    },
    {
      sintoma: "Os seletores de exigência estão bloqueados.",
      acao: "Falta escolher o cliente, o cargo, ou os dois. A lista só é editável com o par completo.",
    },
    {
      sintoma: "Não sei quais cargos daquele cliente já têm régua.",
      acao: "Clique no cliente dentro do painel de clientes com régua: ele abre e mostra os cargos cadastrados, um a um.",
    },
    {
      sintoma: "A Nova Admissão não deixa escolher o cargo daquele cliente.",
      acao: "O cliente está sem régua. Ele aparece no painel do topo desta tela: cadastre a régua e a seleção de cargo destrava.",
    },
  ],
  regras: [
    "A régua resolve pelo par de cliente e cargo: mudou o cargo, mudou o checklist.",
    "Cliente sem nenhuma régua trava a seleção de cargo na Nova Admissão.",
    "O painel de clientes sem régua é o próprio estado, e não uma marcação: o cliente sai dele quando a régua é salva.",
    "A régua salva vale para as próximas admissões daquele par.",
  ],
  relacionados: [
    "definir-a-exigencia-de-cada-documento",
    "aplicar-os-documentos-padrao",
    "inativar-a-regua-de-um-cliente",
    "o-catalogo-de-documentos-da-regua",
    "auditar-os-documentos-da-admissao",
    "ler-a-regua-obrigatoria-da-admissao",
    "cadastrar-um-cliente-novo",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regua/page.tsx",
    "apps/backend/src/admin/regua/regua.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
