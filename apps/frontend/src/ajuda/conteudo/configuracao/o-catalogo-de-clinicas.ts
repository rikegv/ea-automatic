import type { Artigo } from "../../tipos";

/**
 * FICHA: o catálogo de Clínicas.
 *
 * NÃO COBRE a mecânica do catálogo: ela mora no artigo modelo, apontado em `relacionados`.
 *
 * COBRE O QUE ESTA TELA TEM DE DIFERENTE, que são os DOIS CAMPOS PRÓPRIOS além do nome, e o efeito
 * deles no agendamento do exame:
 *   FORNECEDOR, obrigatório, e é a razão de esta ficha existir: o agendamento não pergunta mais o
 *   fornecedor, ele DERIVA daqui. Cadastro feito com fornecedor errado só aparece lá na frente, numa
 *   tela que não mostra este campo, e quem agenda não tem como desconfiar.
 *   ENDEREÇO, opcional, puxado pelo agendamento quando existe.
 *
 * `seDerErrado` PRÓPRIO, com um item só: a recusa por fornecedor em branco é exclusiva desta tela,
 * porque é o único catálogo da família com um segundo campo obrigatório. O resto herda da família.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-clinicas",
  titulo: "O Catálogo De Clínicas",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clinicas"],
  menus: ["clinicas"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O que o catálogo de clínicas governa: além do nome, ele guarda o fornecedor e o endereço, e é deles que o agendamento do exame se alimenta.",
  termos: [
    "clinica",
    "exame admissional",
    "fornecedor",
    "endereco da clinica",
    "cadastrar clinica",
    "clinica nao aparece no agendamento",
    "aso",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Procure a clínica pelo nome antes de criar outra.",
      detalhe:
        "A mesma clínica cadastrada duas vezes divide o histórico de exames entre os dois registros.",
      controles: [
        "Buscar clínica por nome",
        "Ativos",
        "Inativos",
        "Todos",
        "Clínica",
        "Fornecedor",
        "Status",
      ],
    },
    {
      gesto: "Preencha o nome e o fornecedor, informe o endereço quando houver, e clique em Adicionar.",
      detalhe:
        "O fornecedor é obrigatório e o endereço é opcional. Os dois são lidos pelo agendamento do exame.",
      controles: ["Nova clínica *", "Fornecedor *", "Endereço da clínica", "Adicionar"],
    },
    {
      gesto:
        "Para corrigir qualquer um dos três campos, clique em editar na linha; para tirar a clínica de circulação, clique em inativar.",
      controles: [
        "editar",
        "Nome da clínica *",
        "Salvar alterações",
        "Cancelar",
        "inativar",
        "Inativar Clínica",
        "Inativar",
        "reativar",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema não deixa salvar a clínica, mesmo com o nome preenchido.",
      acao: "O fornecedor também é obrigatório nesta tela. Preencha o campo Fornecedor antes de salvar.",
    },
    {
      sintoma: "A coluna Fornecedor mostra não informado numa clínica antiga.",
      acao: "Ela foi cadastrada antes de o campo existir. Clique em editar e preencha o fornecedor: sem ele, o agendamento daquela clínica pode ser recusado por um dado que não aparece na tela de quem agenda.",
    },
  ],
  regras: [
    "O agendamento do exame não pergunta o fornecedor: ele deriva do cadastro da clínica. Fornecedor errado aqui vira agendamento errado lá, sem aviso.",
    "O endereço é opcional e é puxado pelo agendamento quando existe. Sem ele, o agendamento sai sem endereço.",
    "Clínica inativa deixa de ser oferecida no agendamento, e os exames já marcados nela preservam o vínculo e o histórico.",
    "Renomear corrige o nome em todos os exames que já apontam para a clínica, porque o registro é o mesmo.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "agendar-o-exame-admissional",
    "reagendar-o-exame",
    "gerar-o-relatorio-da-clinica",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/clinicas/page.tsx"],
  revisadoEm: "2026-09-30",
};
