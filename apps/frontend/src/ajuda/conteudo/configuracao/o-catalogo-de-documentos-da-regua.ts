import type { Artigo } from "../../tipos";

/**
 * FICHA: o bloco "Documentos da régua", DENTRO da tela da Régua Documental.
 *
 * NÃO COBRE a mecânica geral de catálogo (artigo modelo), e NÃO COBRE o cadastro da régua em si: a
 * escolha do par de cliente e cargo, a aplicação do padrão e a leitura da régua da admissão têm
 * artigos próprios, apontados em `relacionados`. Esta ficha é só do bloco que MANTÉM A LISTA DE
 * DOCUMENTOS.
 *
 * ┌─ A DISTINÇÃO QUE ESTA FICHA EXISTE PARA FIXAR, E ELA É O ERRO MAIS CARO DESTA TELA ───────────┐
 * │ O bloco de documentos cria e renomeia SÓ O NOME do documento. A EXIGÊNCIA (obrigatório, não    │
 * │ obrigatório, facultativo) NÃO é atributo do documento: ela vive no par de cliente e cargo, no   │
 * │ seletor de cada linha. Quem confunde as duas coisas procura a exigência no lugar errado, e, pior, │
 * │ acredita ter tornado um documento obrigatório para o sistema inteiro quando não tornou para     │
 * │ nenhum par.                                                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `seDerErrado` VAZIO: a família `regua-e-documentos` já cobre o nome repetido entre os inativos, o
 * documento não encontrado, a régua já salva que não é sobrescrita e a admissão que segue com o
 * checklist antigo.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-documentos-da-regua",
  titulo: "O Catálogo De Documentos Da Régua",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regua"],
  menus: ["regua"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "regua-e-documentos",
  resumo:
    "Como criar e renomear os documentos que a régua oferece, e por que a exigência de cada um não se define aqui.",
  termos: [
    "tipo de documento",
    "documento novo",
    "criar documento",
    "renomear documento",
    "documento nao aparece na regua",
    "tornar obrigatorio",
    "inativar documento",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto:
        "No bloco de documentos da régua, digite o nome do documento novo e clique em Adicionar documento.",
      detalhe:
        "Ele entra na lista de ativos e passa a ser oferecido em todas as réguas, sem exigência nenhuma definida ainda.",
      controles: ["Documentos da régua", "Novo documento *", "Adicionar documento"],
    },
    {
      gesto: "Defina a exigência no seletor da linha, depois de escolher o cliente e o cargo acima.",
      detalhe:
        "A exigência é gravada para aquele par de cliente e cargo, e só para ele. O mesmo documento pode ser obrigatório num par e facultativo em outro.",
      controles: ["Exigência", "Obrigatório", "Não obrigatório", "Facultativo"],
    },
    {
      gesto:
        "Para corrigir o nome, clique em editar na linha; para tirar o documento de circulação, clique em inativar e confirme.",
      detalhe:
        "O filtro de inativos é onde os documentos fora de circulação ficam consultáveis, com o atalho de reativar.",
      controles: [
        "editar",
        "Nome do documento *",
        "Salvar alterações",
        "Cancelar",
        "inativar",
        "Inativar Documento",
        "Inativar",
        "reativar",
        "Ativos",
        "Inativos",
        "Documento",
        "Status",
        "Ações",
      ],
    },
  ],
  seDerErrado: [],
  regras: [
    "O bloco de documentos guarda só o NOME. Se o documento é obrigatório, não obrigatório ou facultativo é decidido no par de cliente e cargo, no seletor da linha.",
    "Documento novo nasce ativo e passa a ser oferecido em todas as réguas, e não entra sozinho em régua nenhuma: ele só passa a ser cobrado onde alguém definir a exigência.",
    "Documento inativado sai da lista de ativos e deixa de ser oferecido no cadastro das réguas, mas as réguas já salvas que o exigem NÃO mudam: as admissões em andamento continuam cobrando ele.",
    "Renomear corrige o nome em todas as réguas e em todos os documentos das admissões, porque o registro é o mesmo.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "ler-a-regua-obrigatoria-da-admissao",
    "o-catalogo-de-dicas-de-documento",
    "auditar-os-documentos-da-admissao",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/regua/page.tsx"],
  revisadoEm: "2026-09-30",
};
