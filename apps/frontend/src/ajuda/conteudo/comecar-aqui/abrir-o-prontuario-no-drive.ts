import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 8 de 14: O LOGO DO DRIVE ABRE O ARQUIVO.
 *
 * ┌─ UM CONTROLE, QUATRO TELAS, E UMA CONFUSÃO QUE ELE RESOLVE ──────────────────────────────────┐
 * │ O logo colorido do Drive é SEMPRE a mesma coisa: ele abre o arquivo que está guardado fora do   │
 * │ sistema, em outra aba. O que muda é QUAL arquivo, e é isso que o aviso do controle diz: o        │
 * │ prontuário da pessoa, o contrato assinado, o formulário de transporte.                          │
 * │                                                                                                 │
 * │ A confusão que o artigo desfaz é a mais frequente da esteira: "o documento subiu, por que não    │
 * │ tem o logo na linha?". Porque a pasta do prontuário só nasce quando a régua fecha. Antes disso    │
 * │ o arquivo está em trânsito, e não há pasta a abrir.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÓ O PRIMEIRO PASSO TEM IMAGEM, E A CAUSA É ESTRUTURAL, NÃO PREGUIÇA ───────────────────────┐
 * │ O motor casa UM roteiro por artigo (o slug do roteiro tem de bater com o nome do arquivo) e o    │
 * │ roteiro tem UMA rota. Este artigo ensina o mesmo controle em três telas, então só a tela de       │
 * │ âncora pode virar imagem. Os outros dois passos descrevem em texto, e o rótulo literal do          │
 * │ controle fica em `controles`, que é o que a busca indexa e o índice da tela lista.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "abrir-o-prontuario-no-drive",
  titulo: "Abrir O Prontuário No Google Drive",
  modulo: "COMECAR_AQUI",
  rotas: ["/esteira", "/assinaturas", "/beneficios"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "O que o logo do Google Drive abre em cada tela, por que ele às vezes não aparece na linha e onde encontrar o contrato assinado.",
  termos: [
    "drive",
    "google drive",
    "prontuario",
    "pasta",
    "pasta do funcionario",
    "documento arquivado",
    "onde estao os documentos",
    "contrato assinado",
    "abrir arquivo",
    "logo colorido",
    "triangulo colorido",
    "formulario de vt",
  ],
  preRequisitos: [
    "Ter o menu da tela em que você está.",
    "Ter acesso ao Drive do grupo com o seu e-mail corporativo. O arquivo abre em outra aba, fora do sistema.",
  ],
  passos: [
    {
      gesto: "Ache o logo colorido do Drive na linha da pessoa, na coluna de ações.",
      detalhe:
        "Ele sai em todas as filas da esteira, não só na de auditoria: passar o mouse sobre ele diz o que aquele logo abre.",
      controles: ["Abrir prontuário no Google Drive"],
      print: {
        arquivo: "01-logo-do-drive-na-linha.png",
        legenda: "Passo 1: o logo do Drive na coluna de ações da linha.",
      },
    },
    {
      gesto: "Clique no logo.",
      detalhe:
        "A pasta do prontuário abre em outra aba do navegador, com o nome da pessoa e o do cliente, e os documentos já renomeados dentro.",
    },
    {
      gesto: "Para o contrato assinado, use o logo da tela de assinaturas.",
      detalhe:
        "Lá o mesmo logo abre o contrato já assinado, e não a pasta. O aviso do controle diz qual dos dois é.",
      controles: ["Abrir contrato assinado no Google Drive"],
    },
    {
      gesto: "Para o formulário de transporte, use o atalho da tela de benefícios.",
      detalhe:
        "Cada envio abre o seu próprio arquivo, e não o mais recente: é a declaração daquela data que a pessoa assinou.",
      controles: ["Ver Formulário", "Ver"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A linha não tem o logo do Drive.",
      acao: "A pasta ainda não nasceu. Ela é criada quando a régua de documentos obrigatórios fecha, e é só a partir daí que existe pasta para abrir.",
    },
    {
      sintoma: "Cliquei e o Drive pediu acesso.",
      acao: "Entre no Drive com o seu e-mail corporativo. A pasta é do grupo, e o acesso não é concedido pelo sistema.",
    },
    {
      sintoma: "A pasta abriu vazia.",
      acao: "O arquivamento acontece no fechamento da régua. Se a pasta existe e está vazia, avise a administração antes de subir documento de novo.",
    },
    {
      sintoma: "O contrato assinado não tem o logo.",
      acao: "O arquivo só é guardado depois que a assinatura conclui. Enquanto o envelope está aguardando, não há contrato assinado a abrir.",
    },
    {
      sintoma: "Abriu a pasta de outra pessoa.",
      acao: "Confira a linha em que você clicou, e use a busca para isolar a pessoa antes de clicar. Avise a administração se o logo da linha certa levar à pasta errada.",
    },
  ],
  regras: [
    "O logo do Drive sempre abre arquivo guardado fora do sistema, em outra aba.",
    "A pasta do prontuário nasce quando a régua de documentos obrigatórios fecha, e não no momento em que o documento sobe.",
    "O sistema guarda a situação do documento, não uma cópia dele: o arquivo vive no Drive.",
    "O contrato assinado só é guardado depois que a assinatura conclui.",
    "O acesso à pasta é o do seu e-mail corporativo, e não o do sistema.",
  ],
  relacionados: ["ler-a-linha-da-tabela", "buscar-dentro-da-tela"],
  fontes: [
    "apps/frontend/src/components/ui/GoogleDriveLogo.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
