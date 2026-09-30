import type { Artigo } from "../../tipos";

/**
 * N2 DO GERENCIADOR, O DESFECHO 3 de 3: A MARCA DE BANCO. Terceiro gesto do mesmo seletor de status
 * lido junto do declínio e da pausa.
 *
 * ┌─ O ARTIGO É SOBRE UMA TROCA DE COBRANÇA, E É SÓ ISSO QUE ELE ENSINA ──────────────────────────┐
 * │ Marcar banco troca UM item da lista de obrigatórios: a data de admissão SAI (a ausência é        │
 * │ esperada, porque ninguém sabe quando a vaga abre) e o Termo de Banco ENTRA no lugar. Os dois são │
 * │ o mesmo espaço do processo e DOIS interruptores na tela, por decisão do diretor: desligar um não │
 * │ desliga o outro (`pendenciasObrigatorias`, `domain/admissao.ts`).                                │
 * │                                                                                                 │
 * │ NÃO ENSINA A RÉGUA DOCUMENTAL, e a razão é técnica além de ser de escopo: o Termo de Banco NÃO   │
 * │ é item do checklist por cliente e cargo. Ele sobe pelo próprio formulário de edição e é cobrado  │
 * │ como campo obrigatório, não como documento da régua. Quem quiser a régua tem artigo próprio.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ARMADILHA QUE O ARTIGO PRECISA DESARMAR: SÃO DOIS CAMINHOS PARA A MESMA MARCA ─────────────┐
 * │ A caixa "Admissão de banco" e a opção "Banco, Aguardar" do seletor de status escrevem a MESMA   │
 * │ coisa (`admissoes.service.editar`: escolher Banco, Aguardar liga a marca; escolher Em Admissão a │
 * │ desliga). Sem isso escrito, quem escolhe só o status vê a situação voltar para Em Admissão       │
 * │ sozinha no instante seguinte, que foi um defeito real de 13/08/2026.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura das telas com gente está vetada pela auditoria de
 * segurança enquanto a homologação não tiver arnês sintético. Cada passo nomeia o rótulo literal.
 */
export const artigo: Artigo = {
  slug: "marcar-uma-admissao-como-banco",
  titulo: "Marcar Uma Admissão Como Banco",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "gerenciador",
  resumo:
    "Como registrar que a pessoa está pronta e aguardando vaga: o que a marca de banco muda na cobrança da data de admissão, e por que o Termo de Banco passa a ser a formalização exigida.",
  termos: [
    "banco",
    "admissao de banco",
    "banco de talentos",
    "aguardando vaga",
    "sem data de admissao",
    "pronto esperando",
    "termo de banco",
    "banco aguardar",
    "reserva",
    "nao tem data ainda",
  ],
  preRequisitos: [
    "Saber que a pessoa está pronta e sem data definida. Banco é espera, não é admissão parada por problema.",
  ],
  passos: [
    {
      gesto: "Ache a pessoa na lista e clique no lápis, na coluna Ações.",
      controles: ["Ações", "Editar", "Editar admissão"],
    },
    {
      gesto: "No bloco Status das frentes, marque a caixa Admissão de banco.",
      detalhe:
        "O texto ao lado da caixa já diz o que muda: a ausência de data de admissão deixa de ser pendência, e o Termo de Banco passa a ser a pendência de formalização.",
      controles: ["Status das frentes", "Admissão de banco"],
    },
    {
      gesto: "Clique em Termo de Banco e escolha o arquivo do termo assinado.",
      detalhe:
        "O botão aparece só depois que a caixa está marcada. Aceita arquivo em PDF e imagem. Enviado, uma etiqueta ao lado mostra em que estado o documento ficou: Validado, Pendente ou Inconforme. Para trocar o arquivo, o mesmo botão passa a ler Reenviar Termo de Banco.",
      controles: [
        "Termo de Banco",
        "Reenviar Termo de Banco",
        "Validado",
        "Pendente",
        "Inconforme",
      ],
    },
    {
      gesto: "Clique em Salvar alterações.",
      detalhe:
        "A situação da admissão passa a ler Banco, Aguardar, e fica assim enquanto a marca existir.",
      controles: ["Cancelar", "Salvar alterações", "Banco, Aguardar"],
    },
    {
      gesto: "Confira a coluna Pendências Obrig. da linha.",
      detalhe:
        "A data de admissão não é mais cobrada. Se o Termo de Banco ainda não subiu, a etiqueta continua lendo Parcial, e a janela de pendências passa a listar Termo de Banco no lugar de Data de admissão.",
      controles: ["Pendências Obrig.", "Termo de Banco", "Data de admissão"],
    },
    {
      gesto: "Quando a vaga aparecer, desmarque a caixa e preencha a data de admissão.",
      detalhe:
        "Desmarcar devolve a admissão ao fluxo normal, e a situação volta a ler Em Admissão. A data volta a ser cobrada, o que é o certo: agora ela existe.",
      controles: ["Admissão de banco", "Data de admissão", "Salvar alterações"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Escolhi Banco, Aguardar no seletor de status e ele voltou sozinho para Em Admissão.",
      acao: "Isso acontecia quando a marca não acompanhava o status. Hoje os dois andam juntos: escolher Banco, Aguardar liga a caixa Admissão de banco, e escolher Em Admissão a desliga. Se acontecer, recarregue a página e confira se a caixa está marcada.",
    },
    {
      sintoma: "A situação não fica em Banco, Aguardar mesmo com a auditoria e o exame prontos.",
      acao: "Sem a marca, a situação é calculada: o sistema só escreve Banco, Aguardar sozinho quando a auditoria fechou, o exame saiu apto e não há data de admissão. Quem quer segurar a situação marca a caixa, que é decisão explícita.",
    },
    {
      sintoma: "Aparece Tipo de documento TERMO_BANCO não encontrado no catálogo.",
      acao: "O tipo de documento do termo não está cadastrado. Avise a administração: ele é cadastrado na tela de tipos de documento, e sem ele o botão de envio fica desligado.",
    },
    {
      sintoma: "Aparece Falha ao enviar o Termo de Banco.",
      acao: "O envio não foi aceito e nada foi registrado. Confira o formato do arquivo, PDF ou imagem, e tente de novo. Se repetir, avise a administração.",
    },
    {
      sintoma: "Marquei banco e a admissão saiu da fila de integração.",
      acao: "É de propósito, e é a única fila que ela deixa: integração é agendamento com hora marcada, e não se marca reunião para uma data que ainda não existe. Auditoria, exame e cadastro continuam com ela na fila.",
    },
    {
      sintoma: "O Termo de Banco não aparece no checklist de documentos da admissão.",
      acao: "Ele não é item do checklist por cliente e cargo: é cobrado como campo obrigatório e sobe pelo próprio formulário de edição. No arquivamento, ele vai para a subpasta de admissão do prontuário.",
    },
  ],
  regras: [
    "Banco é espera com a pessoa pronta: a falta da data de admissão é esperada e não é cobrada como pendência.",
    "No lugar da data, o Termo de Banco passa a ser a formalização obrigatória, e a pendência só sai quando ele é entregue.",
    "A caixa Admissão de banco e a opção Banco, Aguardar do seletor escrevem a mesma coisa: escolher uma liga a outra, e voltar para Em Admissão desliga as duas.",
    "Enquanto a marca existir, a situação da admissão é Banco, Aguardar, e a automação não a reescreve.",
    "Sem a marca, o sistema ainda pode escrever Banco, Aguardar sozinho quando a auditoria fechou, o exame saiu apto e não há data. Preenchida a data, ele devolve a admissão para Em Admissão.",
    "O Termo de Banco não é item do checklist documental do cliente e do cargo: ele sobe pelo formulário de edição e é arquivado na subpasta de admissão do prontuário.",
    "A admissão de banco sai apenas da fila de integração. Nas outras etapas o trabalho continua.",
    "Banco não é pausa e não é declínio: o trabalho segue, só a data é que não existe ainda.",
  ],
  relacionados: [
    "pausar-e-retomar-uma-admissao",
    "declinar-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "ler-o-modal-de-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
    "ler-a-regua-obrigatoria-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/EditAdmissaoModal.tsx",
    "apps/frontend/src/lib/farol.ts",
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/domain/pendencia-config.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
