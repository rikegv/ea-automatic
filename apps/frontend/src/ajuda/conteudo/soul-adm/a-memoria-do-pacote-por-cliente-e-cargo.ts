import type { Artigo } from "../../tipos";

/**
 * N2 DE BENEFÍCIOS: POR QUE A ADMISSÃO SEGUINTE JÁ NASCE COM PACOTE.
 *
 * ┌─ O ARTIGO EXISTE PORQUE A CAUSA ESTÁ EM OUTRA TELA ───────────────────────────────────────────┐
 * │ Quem cadastra uma admissão nova encontra os benefícios já marcados e pergunta de onde veio      │
 * │ aquilo. A resposta não está no cadastro: está no PACOTE que alguém salvou na fila de benefícios │
 * │ para o mesmo cliente com o mesmo cargo. É um efeito de tela cruzada, e efeito de tela cruzada   │
 * │ sem artigo vira desconfiança do dado ou, pior, aceitação sem conferir.                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO A SUGESTÃO É ESCOLHIDA, MEDIDO E NÃO SUPOSTO ──────────────────────────────────────────┐
 * │ `pacotePadraoClienteCargo` (`admissoes/admissoes.service.ts`) pega a ÚLTIMA admissão CRIADA    │
 * │ daquele par que TENHA pacote montado, e devolve os benefícios dela com os valores. Três        │
 * │ consequências que o texto precisa carregar, porque nenhuma é adivinhável:                      │
 * │   1. é a última CRIADA, então corrigir o pacote de uma admissão antiga não muda a sugestão;     │
 * │   2. quem tem só o texto que veio da planilha não conta, porque não tem pacote montado;         │
 * │   3. par sem histórico não sugere nada, e isso é estado normal, não falha.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA PEÇA NÃO ENSINA o catálogo de benefícios (criar e renomear benefício é tela da administração)
 * nem o passo a passo de montar o pacote, que já é artigo.
 *
 * SEM IMAGEM, pendência conhecida: a fila mostra gente e a captura está vetada pela auditoria de
 * segurança enquanto a homologação não tiver arnês sintético. §A.6: nenhum dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "a-memoria-do-pacote-por-cliente-e-cargo",
  titulo: "A Memória Do Pacote Por Cliente E Cargo",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "beneficios",
  resumo:
    "O pacote que você salva na fila de benefícios passa a ser a sugestão da próxima admissão do mesmo cliente com o mesmo cargo. Como a sugestão é escolhida, quem entra nessa memória e o que fazer quando o pacote de uma pessoa é exceção.",
  termos: [
    "por que veio com beneficio",
    "pacote sugerido",
    "memoria do pacote",
    "sugestao de beneficio",
    "fora do padrao",
    "pacote da ultima admissao",
    "cliente e cargo",
    "mesmo cargo",
    "veio marcado sozinho",
    "texto importado",
    "pacote estruturado",
  ],
  preRequisitos: [
    "Saber o cargo da pessoa. A memória é do par cliente mais cargo: o mesmo cliente com outro cargo tem outra memória.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e monte ou corrija o pacote da pessoa pelo lápis da linha.",
      detalhe:
        "O passo a passo do pacote é o artigo de montar o pacote de benefícios. O que interessa aqui é o efeito do salvamento fora desta tela.",
      controles: ["Benefícios", "Ações", "Editar os benefícios", "Editar Benefícios"],
    },
    {
      gesto: "Saiba o que o salvamento alimenta.",
      detalhe:
        "A próxima admissão cadastrada para aquele mesmo cliente com aquele mesmo cargo chega com esse pacote já marcado, e com os valores. É sugestão editável, nunca imposição: quem cadastra confirma ou ajusta.",
    },
    {
      gesto: "Confira quem entra na memória pelo filtro Pacote.",
      detalhe:
        "Com pacote estruturado é quem tem o pacote montado item a item, e só esses alimentam a sugestão. Só texto importado é quem veio de planilha antiga, com o pacote em texto corrido: esses não sugerem nada até alguém montar o pacote pelo lápis.",
      controles: ["Pacote", "Com Pacote Estruturado", "Só Texto Importado"],
    },
    {
      gesto: "Entenda qual admissão vira a sugestão.",
      detalhe:
        "É a última admissão criada daquele par que tenha pacote montado. Corrigir o pacote de uma admissão antiga não muda a sugestão da próxima: quem manda é a mais recente.",
    },
    {
      gesto: "Quando o pacote de uma pessoa for exceção, monte a exceção mesmo assim.",
      detalhe:
        "Sendo aquela a última do par, a exceção passa a ser a sugestão da próxima pessoa. A tela de cadastro avisa quando o pacote foge do padrão daquele cliente com aquele cargo, e ela deixa seguir: é aviso, não bloqueio.",
    },
    {
      gesto: "No cadastro da admissão, leia a linha de apoio abaixo dos benefícios.",
      detalhe:
        "Ela diz quando o pacote na tela é o sugerido pela última admissão do par, e mostra qual é. Havendo divergência, o aviso amarelo aparece no lugar dela.",
      controles: ["Pacote sugerido pela última admissão deste cliente/cargo (editável):"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A admissão nova nasceu com um benefício que aquela pessoa não tem.",
      acao: "É a sugestão do par cliente mais cargo, tirada da última admissão criada. Desmarque o benefício no próprio cadastro: o que ficar na tela é o que vai para a admissão.",
    },
    {
      sintoma: "Corrigi o pacote de uma pessoa e a admissão seguinte veio errada do mesmo jeito.",
      acao: "A sugestão sai da última admissão criada do par. Corrigir uma admissão antiga não a torna a mais recente. Corrija o pacote da última, ou ajuste no próprio cadastro da pessoa nova.",
    },
    {
      sintoma: "Aquele cliente com aquele cargo nunca sugere nada.",
      acao: "O par ainda não tem nenhuma admissão com pacote montado item a item. A partir do primeiro pacote salvo pelo lápis, ele passa a sugerir.",
    },
    {
      sintoma: "A pessoa tem o pacote em texto corrido e ele não sugeriu nada.",
      acao: "Texto que veio de planilha não é pacote montado, então não entra na memória. Abra o lápis e monte o pacote: a linha passa a mostrar as colunas de sigla e o par passa a sugerir.",
    },
    {
      sintoma: "No cadastro apareceu o aviso de pacote fora do padrão deste cliente e cargo.",
      acao: "É aviso, não bloqueio. Ele compara o que está na tela com o pacote da última admissão do par. Estando certo, siga; foi engano, ajuste ali mesmo.",
    },
    {
      sintoma: "Quero que o cliente inteiro sugira o mesmo pacote, independente do cargo.",
      acao: "A memória é por cliente mais cargo, e não por cliente. O que vale para o cliente inteiro é o padrão do cadastro dele e a regra de benefício da janela de principais informações.",
    },
  ],
  regras: [
    "A memória é do par cliente mais cargo: o mesmo cliente com outro cargo tem outra memória.",
    "A sugestão sai da última admissão criada daquele par que tenha pacote montado item a item, com os valores dela.",
    "Pacote que veio de planilha, em texto corrido, não entra na memória.",
    "Par sem histórico de pacote montado não sugere nada, e isso é estado normal.",
    "A sugestão é editável no cadastro, e o cadastro avisa, sem bloquear, quando o pacote foge do padrão do par.",
    "Salvar o pacote de uma pessoa não altera pacote de mais ninguém: o que muda é a sugestão da próxima.",
  ],
  relacionados: [
    "montar-o-pacote-de-beneficios",
    "o-padrao-do-cliente-que-pre-preenche-o-wizard",
    "definir-cargo-folha-e-beneficios-na-nova-admissao",
    "as-regras-de-beneficio-do-cliente",
    "cadastrar-uma-admissao-nova",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/beneficios/beneficios-fila.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
