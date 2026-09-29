import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR 2 de 4: O MAPA DA FICHA.
 *
 * ┌─ É A TELA MAIS ABERTA DO SISTEMA, E ELA NÃO ESTAVA NO INVENTÁRIO ────────────────────────────┐
 * │ A ficha (`components/esteira/AdmissaoDetalheModal.tsx`, 1.812 linhas) é o que se abre pelo olho │
 * │ em QUATRO telas diferentes, e ninguém a tinha listado como peça de manual porque ela não é uma  │
 * │ rota: é uma janela. O resultado prático é que a tela mais consultada do sistema era a única sem │
 * │ nenhuma explicação, e a pessoa aprendia a lê-la por tentativa.                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE ARTIGO É UM MAPA, E NÃO UM PASSO A PASSO DE SETE CLIQUES ──────────────────────┐
 * │ Abrir a ficha é UM gesto. O trabalho todo, depois dele, é LER: são seis blocos fixos, dois que  │
 * │ só existem quando há registro, três avisos que aparecem por cima quando o caso pede e uma faixa │
 * │ de correções. Quem chega aqui não precisa de um roteiro de cliques, precisa saber onde está o    │
 * │ dado que ele procura. Então cada passo é um BLOCO, na ordem em que a ficha os desenha, e o gesto │
 * │ é "leia este bloco", que é honestamente o que a pessoa faz.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS RÓTULOS SÃO OS DO CÓDIGO, letra por letra, inclusive a inconsistência que EXISTE na tela e que
 * o manual não conserta (§A.14): o bloco 2 escreve "Gestor BP" e o formulário de edição escreve
 * "Gestor / BP"; o título de bloco é escrito em caixa normal no código e a folha de estilo o desenha
 * em caixa alta. Declarar o que está lá é o que faz a busca por rótulo funcionar.
 *
 * §A.6: nenhum nome, CPF, e-mail ou telefone de pessoa real aparece neste arquivo. O que o artigo
 * nomeia são os RÓTULOS dos campos, nunca os valores deles.
 */
export const artigo: Artigo = {
  slug: "ler-a-ficha-da-admissao",
  titulo: "Ler A Ficha Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador", "/esteira", "/beneficios", "/nao-conformidades"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "O mapa da janela que o olho abre: onde está cada dado da admissão, bloco por bloco, o que os avisos coloridos do topo querem dizer e o que dali é leitura e o que é ação.",
  termos: [
    "ficha",
    "olho",
    "olhinho",
    "ver ficha",
    "detalhe",
    "abrir a admissao",
    "dados do candidato",
    "onde vejo o salario",
    "onde vejo a matricula",
    "onde vejo o exame",
    "quem alterou",
    "historico",
    "prontuario",
    "contrato assinado",
    "aso",
  ],
  preRequisitos: [
    "Ter a admissão localizada na lista. A ficha abre a partir de uma linha, ela não tem endereço próprio.",
  ],
  passos: [
    {
      gesto: "Clique no olho, na coluna Ações da linha da pessoa.",
      detalhe:
        "A ficha abre como janela por cima da lista. O mesmo olho existe na Esteira, em Benefícios e em Não Conformidades, e abre esta mesma ficha.",
      controles: ["Ações", "Ver ficha"],
    },
    {
      gesto: "Confira o topo: o nome, a origem da admissão e a data em que ela chegou.",
      detalhe:
        "A etiqueta ao lado do nome diz se a admissão nasceu à mão ou veio do Pandapé. Logo abaixo, a ficha avisa que é somente leitura e diz quando foi recebida. Saia pelo Fechar, no canto, ou pela tecla Esc.",
      controles: ["Ficha da admissão", "Somente leitura", "Fechar"],
      print: {
        arquivo: "01-ficha-topo.png",
        legenda: "Passo 2: o topo da ficha e o bloco Dados pessoais.",
      },
    },
    {
      gesto: "Leia os avisos coloridos, quando eles aparecerem, antes de qualquer bloco.",
      detalhe:
        "Amarelo é trabalho a fazer, vermelho muda a leitura da ficha inteira. Observação da liberação é o recado que o consultor deixou. EPI A Validar lista o equipamento a conferir com o cliente. Troca De Cliente Ou Cargo avisa que o par mudou e que os documentos já coletados podem não servir mais, e o botão Revisado registra quem conferiu.",
      controles: [
        "Observação da liberação",
        "EPI A Validar",
        "Troca De Cliente Ou Cargo",
        "Revisado",
      ],
    },
    {
      gesto: "Na faixa Correções, veja o que é possível corrigir por ali.",
      detalhe:
        "Alocar em Alto Volume vale para qualquer usuário. Trocar cliente e cargo e Corrigir CPF aparecem só para Master e Super Admin, porque mexem na identidade da admissão.",
      controles: [
        "Correções",
        "Alocar em Alto Volume",
        "Trocar cliente e cargo",
        "Corrigir CPF",
      ],
    },
    {
      gesto: "Bloco Dados pessoais: quem é a pessoa.",
      detalhe:
        "Nome, CPF, telefone, e-mail, data de nascimento e o banco que o candidato informou. Uniforme é a resposta da pergunta possui uniforme, com os três tamanhos quando a resposta é Sim. O botão Editar uniforme corrige o tamanho sem sair da ficha.",
      controles: [
        "Dados pessoais",
        "Nome",
        "CPF",
        "Telefone",
        "E-mail",
        "Data de nascimento",
        "Banco",
        "Uniforme",
        "Camiseta",
        "Calça",
        "Bota",
        "Editar uniforme",
      ],
    },
    {
      gesto: "Bloco Trabalho e cadastro: o que a folha precisa saber.",
      detalhe:
        "Cliente vem com o código na frente, porque existem clientes de mesma razão social. Aqui estão salário, tipo e motivo de contratação, data de admissão, matrícula, escala, setor, centro de custo, loja, gestor, departamento e o endereço de trabalho.",
      controles: [
        "Trabalho e cadastro",
        "Cliente",
        "Cargo",
        "Salário",
        "Tipo de contrato",
        "Motivo da contratação",
        "Data de admissão",
        "Matrícula",
        "Escala",
        "Setor",
        "Centro de custo",
        "Loja / Unidade",
        "Gestor BP",
        "Departamento",
        "Endereço de trabalho",
      ],
      print: {
        arquivo: "02-ficha-trabalho-e-exame.png",
        legenda: "Passo 6: os blocos Trabalho e cadastro e Exame admissional.",
      },
    },
    {
      gesto: "Bloco Exame admissional: o agendamento e o veredito do atestado.",
      detalhe:
        "Data, horário, clínica, local, fornecedor, valor e previsão do ASO. Quando nada foi agendado, o bloco diz Exame ainda não agendado. Abaixo, a etiqueta do ASO diz em que ponto está a leitura do atestado, e Ver ASO abre o arquivo que foi anexado.",
      controles: [
        "Exame admissional",
        "Data",
        "Horário",
        "Clínica",
        "Local",
        "Fornecedor",
        "Valor do exame",
        "Previsão do ASO",
        "Exame ainda não agendado.",
        "ASO Não Anexado",
        "ASO Anexado, Aguardando Validação Da I.A",
        "ASO Validado Pela I.A",
        "ASO Reprovado Pela I.A",
        "Ver ASO",
      ],
    },
    {
      gesto: "Bloco Status das frentes: onde a admissão está no processo.",
      detalhe:
        "Farol é a situação geral, Pendências é o resumo do preenchimento, e os três cartões mostram Auditoria, Exame e Cadastro / Contrato. Quando houver, aparecem também o motivo do declínio, a etiqueta Pausada com o motivo, a situação da assinatura e os atalhos para o Google Drive.",
      controles: [
        "Status das frentes",
        "Farol:",
        "Pendências:",
        "Auditoria",
        "Exame",
        "Cadastro / Contrato",
        "Motivo do declínio:",
        "Pausada",
        "Motivo da pausa:",
        "Assinatura:",
        "Prontuário no Drive",
        "Contrato assinado no Drive",
        "Reenviar Por Correção",
      ],
      print: {
        arquivo: "03-ficha-frentes-e-vt.png",
        legenda: "Passo 8: os blocos Status das frentes e Formulário de VT.",
      },
    },
    {
      gesto: "Bloco Formulário de VT: o link do vale-transporte do candidato.",
      detalhe:
        "Gerar link do VT cria o endereço que o candidato abre no celular, e Copiar o põe na área de transferência. O link tem prazo, e a ficha mostra quando ele expira. Buscar formulário de VT procura na pasta de coleta o formulário que o candidato já preencheu.",
      controles: [
        "Formulário de VT",
        "Gerar link do VT",
        "Buscar formulário de VT",
        "Link do formulário de VT",
        "Copiar",
      ],
    },
    {
      gesto: "No fim da ficha, leia a trilha e o histórico, quando existirem.",
      detalhe:
        "Trilha de passagem guarda os avanços feitos com campo obrigatório em branco, com quem aceitou e o que faltava. Histórico de alterações mostra campo por campo o que mudou, de que valor para qual, por quem e quando. Os dois blocos só aparecem quando há registro.",
      controles: [
        "Trilha de passagem (avanços com pendência)",
        "Histórico de alterações",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela abriu escrito Carregando ficha… e ficou assim.",
      acao: "A consulta não voltou. Feche pelo Esc, recarregue a página e abra de novo pelo olho.",
    },
    {
      sintoma: "A ficha mostra Admissão não encontrada.",
      acao: "Aquela admissão não existe mais, ou a lista está velha na sua tela. Feche, recarregue a página e procure a pessoa outra vez.",
    },
    {
      sintoma: "Cliquei em Ver ASO e apareceu que o ASO não está mais disponível para visualização.",
      acao: "O arquivo é temporário: o sistema guarda a situação do documento, não uma cópia eterna. Para conferir o atestado depois disso, abra o prontuário no Drive.",
    },
    {
      sintoma: "Não vejo os blocos Trilha de passagem nem Histórico de alterações.",
      acao: "Não é falha: eles existem só quando há registro. Admissão sem avanço com pendência e sem alteração de campo não tem o que mostrar.",
    },
    {
      sintoma: "Não vejo os botões Trocar cliente e cargo nem Corrigir CPF.",
      acao: "Eles aparecem só para Master e Super Admin. Peça a correção a quem tem o papel, e lembre que trocar o cliente ou o cargo muda a régua de documentos da admissão.",
    },
    {
      sintoma: "O campo que eu procuro está escrito não informado.",
      acao: "Aquele dado não existe na admissão. Se for campo obrigatório, ele aparece na etiqueta de pendências da linha, e o preenchimento é feito pelo lápis.",
    },
  ],
  regras: [
    "A ficha é de leitura. As únicas ações dela são o uniforme, a alocação em Alto Volume, o formulário de VT, o Revisado da troca e o reenvio da assinatura por correção.",
    "O CPF é a identidade da pessoa e não se edita como campo comum. Corrigir CPF é ação de Master, para o caso de ele ter nascido errado.",
    "Uniforme respondido como Não é resposta completa e fecha a pendência. Só não respondido é pendência: o que se cobra é a resposta, nunca ter uniforme.",
    "O código na frente do cliente é informação, não campo: ele existe porque há clientes com a mesma razão social e códigos diferentes.",
    "Quem decide se o atestado do exame está válido é a inteligência artificial, na leitura do documento. A ficha mostra o veredito, ela não o altera.",
    "Prontuário e contrato assinado abrem no Google Drive, fora do sistema. O sistema guarda o endereço, não o arquivo.",
    "O histórico de alterações é trilha de auditoria: ele registra quem mudou o quê e não é apagável pela tela.",
  ],
  relacionados: [
    "achar-uma-admissao-no-gerenciador",
    "editar-os-dados-de-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "abrir-o-prontuario-no-drive",
    "abrir-e-fechar-uma-janela-do-sistema",
    "anexar-o-aso-no-exame",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/frontend/src/components/ui/Bloco.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
