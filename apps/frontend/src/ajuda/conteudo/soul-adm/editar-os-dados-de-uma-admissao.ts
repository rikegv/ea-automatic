import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR 3 de 4: CORRIGIR O DADO.
 *
 * ┌─ O CAMINHO PRINCIPAL É O LÁPIS, E O QUE ELE **NÃO** EDITA É METADE DO ARTIGO ────────────────┐
 * │ O formulário abre com quatro blocos, e três coisas dentro dele são só leitura de propósito: CPF, │
 * │ cliente e cargo (identidade da admissão) e os dados do exame (que vêm do agendamento). Quem não  │
 * │ sabe disso procura o campo, não acha, e conclui que a tela está quebrada. Os rótulos da própria  │
 * │ tela dizem "não editável", e o artigo repete o porquê.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SALVAR COM CAMPO OBRIGATÓRIO VAZIO É PERMITIDO, E ISSO PRECISA ESTAR ESCRITO ───────────────┐
 * │ Só o nome do candidato trava o salvamento. Todo o resto grava incompleto, e o que faltar vira   │
 * │ pendência visível em vez de bloqueio: é a regra do sistema, não uma falha de validação. Sem esta │
 * │ frase no artigo, a pessoa fica caçando o erro que não existe, ou pior, inventa um valor para o   │
 * │ campo passar.                                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS ERROS DE `seDerErrado` SÃO OS QUE O SISTEMA RESPONDE DE VERDADE, copiados do código: a trava do
 * nome e a falha genérica saem do próprio formulário (`components/gerenciador/EditAdmissaoModal.tsx`);
 * o bloqueio da Liberação Admissional, a recusa da loja e a recusa da pausa saem do servidor
 * (`admissoes.service.ts`, `loja-da-admissao.ts`, `esteira.service.ts`); a negativa de menu sai do
 * guard (`auth/guards/menu.guard.ts`). Erro imaginado não ajuda ninguém a procurar.
 */
export const artigo: Artigo = {
  slug: "editar-os-dados-de-uma-admissao",
  titulo: "Editar Os Dados De Uma Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como corrigir os dados de uma admissão pelo lápis do Gerenciador: o que cada bloco do formulário edita, o que é só leitura, o que é obrigatório e onde a correção fica registrada.",
  termos: [
    "editar",
    "corrigir",
    "alterar",
    "mudar",
    "atualizar",
    "lapis",
    "salvar",
    "trocar salario",
    "mudar data de admissao",
    "colocar matricula",
    "corrigir telefone",
    "pausar admissao",
    "declinar",
    "admissao de banco",
  ],
  preRequisitos: [
    "Ter a admissão localizada na lista do Gerenciador.",
    "Saber o valor certo do que você vai corrigir. O formulário grava o que você escrever, sem conferir com outra fonte.",
  ],
  passos: [
    {
      gesto: "Clique no lápis, na coluna Ações da linha da pessoa.",
      detalhe:
        "A janela Editar admissão abre por cima da lista, com o mesmo desenho de blocos da ficha. O olho, ao lado, abre a mesma admissão só para leitura.",
      controles: ["Ações", "Editar", "Editar admissão"],
      print: {
        arquivo: "01-botao-editar.png",
        legenda: "Passo 1: o lápis da linha, que abre o formulário de edição.",
      },
    },
    {
      gesto: "No bloco Dados pessoais, corrija o que for da pessoa.",
      detalhe:
        "Nome, telefone, e-mail, data de nascimento e sexo. O CPF aparece apagado e não se edita: ele é a identidade. O nome é o único campo que não pode ficar vazio.",
      controles: [
        "Dados pessoais",
        "CPF (identidade, não editável)",
        "Nome",
        "Telefone",
        "E-mail",
        "Data de nascimento",
        "Sexo",
      ],
      print: {
        arquivo: "02-formulario-de-edicao.png",
        legenda: "Passo 2: o formulário aberto, com o bloco Dados pessoais e o CPF em leitura.",
      },
    },
    {
      gesto: "No bloco Trabalho e cadastro, corrija o que a folha usa.",
      detalhe:
        "Salário, tipo de contrato, data de admissão, matrícula, escala, centro de custo, loja, departamento, gestor, tempo de contrato, motivo, benefícios e endereço de trabalho. Cliente e cargo aparecem só para conferência, e o banco, a agência e a conta são o que o candidato informou, para você comparar com o comprovante.",
      controles: [
        "Trabalho e cadastro",
        "Cliente (não editável)",
        "Cargo (não editável)",
        "Banco",
        "Agência",
        "Conta",
        "Salário",
        "Tipo de contrato",
        "Data de admissão",
        "Matrícula",
        "Escala",
        "Centro de custo",
        "Loja / Unidade",
        "Departamento",
        "Gestor / BP",
        "Tempo de contrato",
        "Motivo",
        "Benefícios",
        "Endereço de trabalho",
      ],
    },
    {
      gesto: "No bloco Status das frentes, ajuste a situação da admissão quando for o caso.",
      detalhe:
        "O seletor de status muda a situação geral. Escolher Admissão Pausada para o trabalho e abre o campo do motivo. Escolher um status de declínio pede o motivo do declínio. Marcar Admissão de banco troca a cobrança da data de admissão pela entrega do Termo de Banco, que sobe ali mesmo.",
      controles: [
        "Status das frentes",
        "Status (farol)",
        "Admissão Pausada",
        "Motivo da pausa (opcional)",
        "Motivo do declínio",
        "Admissão de banco",
        "Termo de Banco",
      ],
    },
    {
      gesto: "Clique em Salvar alterações.",
      detalhe:
        "A lista recarrega e avisa que a admissão foi atualizada. Cancelar fecha sem gravar nada. Falta um campo obrigatório? Salve mesmo assim: ele vira pendência, e a pendência avisa sem travar.",
      controles: ["Cancelar", "Salvar alterações"],
      print: {
        arquivo: "03-salvar-alteracoes.png",
        legenda: "Passo 5: o rodapé do formulário, com Cancelar e Salvar alterações.",
      },
    },
    {
      gesto: "Confira o resultado abrindo a ficha pelo olho.",
      detalhe:
        "O bloco Histórico de alterações, no fim da ficha, mostra cada campo que mudou, o valor antigo, o novo, quem fez e quando. É por ali que se confere se a correção pegou.",
      controles: ["Ver ficha", "Histórico de alterações"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela mostra O nome do candidato é obrigatório.",
      acao: "O campo Nome ficou vazio. Escreva o nome e salve de novo. É a única trava do formulário.",
    },
    {
      sintoma: "A janela mostra Falha ao salvar.",
      acao: "A gravação não foi aceita e nada mudou. Confira a sua sessão, feche pelo Cancelar, abra de novo e repita a correção.",
    },
    {
      sintoma:
        "Aparece Acesso negado: esta operação exige o menu gerenciador, que não está liberado para o seu usuário.",
      acao: "Você consegue ver a lista, mas não corrigir por ela. Peça à diretoria a liberação do menu Gerenciador.",
    },
    {
      sintoma:
        "Aparece que a admissão ainda está na Liberação Admissional e que a edição não cria as frentes de Auditoria e Exame.",
      acao: "Você tentou mudar o status de uma pré-admissão. O caminho é a tela de Liberação Admissional: reative e libere por lá, que é o que cria as etapas e o checklist de documentos.",
    },
    {
      sintoma:
        "Aparece A loja escolhida não pertence a este cliente, ou que a loja está inativa.",
      acao: "A lista de lojas é por cliente. Escolha uma loja do cliente desta admissão, ou peça a reativação da loja à administração.",
    },
    {
      sintoma:
        "Aparece Só admissão em andamento pode ser pausada (banco, concluída e declinada não entram).",
      acao: "Pausa vale só para admissão em andamento. Se ela está como banco, concluída ou declinada, primeiro ajuste o status.",
    },
    {
      sintoma: "Procurei o campo Setor e ele não está no formulário.",
      acao: "O formulário do Gerenciador não tem caixa para o Setor, ele é preenchido na Liberação Admissional. Se o Setor aparecer como pendência de uma admissão já liberada, avise a administração.",
    },
  ],
  regras: [
    "CPF, cliente e cargo não se editam por aqui: são a identidade da admissão. Trocar cliente e cargo, ou corrigir o CPF, é ação de Master, pela ficha.",
    "Só o nome trava o salvamento. Todo o resto grava incompleto, e o que falta vira pendência: o sistema sinaliza, ele não impede.",
    "Corrigir nome, telefone, e-mail, nascimento ou sexo vale para todas as admissões daquela pessoa, porque o candidato é um só por CPF.",
    "Toda alteração fica registrada com autor, data, valor anterior e valor novo, e o registro não se apaga pela tela.",
    "Os dados do exame não se editam aqui: eles vêm da tela de agendamento.",
    "A situação de cada etapa não se edita aqui: Auditoria, Exame e Cadastro aparecem só para leitura, e mudam na Esteira.",
    "Benefício que exige valor continua pedindo o valor, e a falta do valor não impede salvar o resto.",
    "Marcar Admissão de banco é dizer que a ausência de data de admissão é esperada. No lugar dela, passa a ser cobrado o Termo de Banco.",
  ],
  relacionados: [
    "achar-uma-admissao-no-gerenciador",
    "ler-a-ficha-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/EditAdmissaoModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/loja-da-admissao.ts",
    "apps/backend/src/auth/guards/menu.guard.ts",
  ],
  revisadoEm: "2026-09-28",
};
