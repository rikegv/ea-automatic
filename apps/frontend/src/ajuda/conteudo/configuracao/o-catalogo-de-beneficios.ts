import type { Artigo } from "../../tipos";

/**
 * FICHA: o catálogo de Benefícios.
 *
 * NÃO COBRE a mecânica do catálogo: ela mora no artigo modelo, apontado em `relacionados`.
 *
 * COBRE O CAMPO "EXIGE VALOR", que é a razão de esta tela existir como cadastro e não como lista
 * fixa no código. Ele responde uma pergunta só: este benefício precisa de um valor por pessoa, ou
 * ele é apenas concedido ou não concedido? E a resposta é lida em três lugares depois daqui, o
 * cadastro da admissão, a Liberação e o modal do Gerenciador. Quem marca errado não vê nada errado
 * NESTA tela: o efeito aparece no campo de valor que some ou que passa a ser cobrado lá na frente.
 *
 * O TEXTO NÃO CITA EXEMPLO DE BENEFÍCIO de propósito. A tela cita, e ela pode: valor de catálogo
 * muda, e ficha que lista itens de catálogo envelhece sozinha, sem nada falhar.
 *
 * `preRequisitos` e `seDerErrado` vazios: a família `catalogo-admissao` cobre tudo, e não há erro
 * exclusivo desta tela.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-beneficios",
  titulo: "O Catálogo De Benefícios",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/beneficios"],
  menus: ["beneficios"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O que o catálogo de benefícios governa, e por que a marca Exige valor decide se o benefício pede um valor por pessoa no pacote da admissão.",
  termos: [
    "beneficio",
    "cadastrar beneficio",
    "beneficio nao aparece",
    "exige valor",
    "valor do beneficio",
    "pacote de beneficios",
    "vale",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Procure o benefício pelo nome antes de criar outro.",
      detalhe: "O mesmo benefício cadastrado duas vezes aparece duas vezes na montagem do pacote.",
      controles: [
        "Buscar benefício por nome",
        "Ativos",
        "Inativos",
        "Todos",
        "Benefício",
        "Exige valor",
        "Status",
      ],
    },
    {
      gesto: "Digite o nome, marque Exige valor quando couber e clique em Adicionar.",
      detalhe:
        "Marque quando o benefício precisa de um valor por pessoa. Sem a marca, ele é apenas concedido ou não concedido.",
      controles: ["Novo benefício *", "Exige valor", "Adicionar"],
    },
    {
      gesto:
        "Para corrigir o nome ou a marca de valor, clique em editar na linha; para tirar o benefício de circulação, clique em inativar.",
      controles: [
        "editar",
        "Nome do benefício *",
        "Salvar alterações",
        "Cancelar",
        "inativar",
        "Inativar Benefício",
        "Inativar",
        "reativar",
      ],
    },
  ],
  seDerErrado: [],
  regras: [
    "A marca Exige valor é lida no cadastro da admissão, na Liberação e no modal do Gerenciador: com ela, o benefício pede um valor por pessoa; sem ela, ele é apenas concedido ou não concedido.",
    "Mudar a marca de um benefício que já está em pacotes muda o que as telas passam a pedir dali em diante, e não reescreve os valores já lançados.",
    "Benefício inativo deixa de ser oferecido na montagem do pacote, e as admissões que já o alocaram preservam o vínculo e o histórico.",
    "Renomear corrige o nome em todos os pacotes que já usam o benefício, porque o registro é o mesmo.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "montar-o-pacote-de-beneficios",
    "as-regras-de-beneficio-do-cliente",
    "a-memoria-do-pacote-por-cliente-e-cargo",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/beneficios/page.tsx"],
  revisadoEm: "2026-09-30",
};
