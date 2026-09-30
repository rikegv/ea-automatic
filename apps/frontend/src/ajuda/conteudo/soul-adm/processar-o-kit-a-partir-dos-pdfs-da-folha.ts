import type { Artigo } from "../../tipos";

/**
 * N1 DO GERADOR DE KIT, 1 de 4: A ENTRADA. Escolher o kit, subir os arquivos e processar.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre o caminho até o resultado aparecer na tela: o seletor de kit, a seleção dos          │
 * │ arquivos, o botão de processar e a leitura dos quatro indicadores do resultado. Ela PARA ali.  │
 * │                                                                                                │
 * │ O que ela deliberadamente NÃO cobre, e por quê:                                                │
 * │   . o DOWNLOAD e a conferência de identidade, que são a peça "Baixar O Kit De Um Funcionário"; │
 * │   . a REIMPORTAÇÃO do que não foi reconhecido, que é a peça "Reimportar Os Documentos Que      │
 * │     Faltam", porque ela pressupõe um resultado já na tela;                                     │
 * │   . o ENVIO para assinatura, que é a peça "Enviar O Kit Para Assinatura";                      │
 * │   . as REGRAS do kit (quais títulos entram em cada tipo de vínculo, o dicionário, o documento  │
 * │     marcado como padrão). Isso é cadastro, mora em OUTRA tela e em outro menu, e ensinar aqui  │
 * │     seria documentar a tela errada.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E ISSO É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a auditoria de segurança vetou a
 * captura das telas que mostram pessoa enquanto a homologação não tiver arnês de dado sintético.
 * O resultado desta tela é uma lista de funcionários com nome e CPF mascarado, então ela cai
 * inteira nesse veto. O texto foi escrito para funcionar lido, sem depender de figura.
 *
 * §A.6: nenhum nome, CPF ou valor visto em tela, base ou registro entra neste arquivo. O que se
 * descreve é o CAMPO. §A.11: nenhum travessão. §A.24: title case no título e nas etiquetas.
 */
export const artigo: Artigo = {
  slug: "processar-o-kit-a-partir-dos-pdfs-da-folha",
  titulo: "Processar O Kit A Partir Dos PDFs Da Folha",
  modulo: "SOUL_ADM",
  rotas: ["/gerador-kit"],
  menus: ["gerador-kit"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerador-kit",
  resumo:
    "Como transformar os arquivos que saem do sistema de folha nos kits separados por funcionário: escolher o tipo de vínculo, subir os arquivos, processar e ler o que o sistema encontrou.",
  termos: [
    "gerar contrato",
    "montar kit",
    "subir pdf da folha",
    "processar kit",
    "kit admissional",
    "separar contrato por funcionario",
    "dividir pdf",
    "pdf da folha",
    "gerador de kit",
    "contrato de trabalho",
    "tipo de vinculo",
  ],
  preRequisitos: [
    "Saber qual tipo de vínculo é o daquele lote, porque é ele que define quais documentos o sistema vai procurar.",
  ],
  passos: [
    {
      gesto: "Abra o Gerador De Kit pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre vazia, com o seletor de kit à esquerda e a área de arquivos à direita.",
      controles: ["Gerador De Kit", "Processar Kit"],
    },
    {
      gesto: "Escolha o kit no campo Kit (tipo de vínculo).",
      detalhe:
        "O número entre parênteses ao lado de cada kit é a quantidade de documentos que ele espera. Enquanto o kit não for escolhido, a área de arquivos fica desligada.",
      controles: ["Kit (tipo de vínculo)"],
    },
    {
      gesto: "Clique na área de arquivos e selecione os arquivos do sistema de folha.",
      detalhe:
        "Pode selecionar vários de uma vez, e pode clicar de novo para somar mais depois. Só PDF é aceito, e arquivo repetido não entra duas vezes.",
      controles: [
        "PDFs do sistema de folha",
        "Clique para selecionar os PDFs (só PDF, vários de uma vez)",
      ],
    },
    {
      gesto: "Confira a lista de arquivos e remova o que não é daquele lote.",
      detalhe:
        "Cada linha mostra o nome e o tamanho do arquivo, com um botão de remover à direita. Ao lado do botão de processar aparece a contagem do que está selecionado.",
      controles: ["Remover"],
    },
    {
      gesto: "Clique em Processar Kit.",
      detalhe:
        "A barra de progresso mostra em que lote o sistema está. Quando a mensagem vira Aguardando disponibilidade e a barra fica amarela, o processamento não falhou: ele está esperando a vez e tenta de novo sozinho, e a contagem de novas tentativas aparece ao lado.",
      controles: ["Processar Kit"],
    },
    {
      gesto: "Espere o resultado e leia os quatro indicadores do topo.",
      detalhe:
        "PDFs recebidos é o que você subiu; Funcionários é quantas pessoas o sistema separou; Documentos é o total de páginas reconhecidas e distribuídas; Não reconhecidos é o que sobrou sem dono e precisa ser revisado.",
      controles: ["PDFs recebidos", "Funcionários", "Documentos", "Não reconhecidos"],
    },
    {
      gesto: "Confira a lista Kits por funcionário, logo abaixo dos indicadores.",
      detalhe:
        "Cada linha traz o nome, a etiqueta Completo ou a contagem do que falta, e o total de documentos encontrados em relação ao que aquele kit espera. Clique na linha para abrir a lista item por item.",
      controles: ["Kits por funcionário", "Completo"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor de kit mostra Nenhum kit ativo.",
      acao: "Não há nenhum tipo de vínculo ativo para escolher, então o processamento não tem régua nenhuma para seguir. Isso é cadastro de outra tela: peça à administração para ativar o kit daquele tipo de vínculo.",
    },
    {
      sintoma: "A tela avisa que arquivos foram ignorados porque apenas PDF é aceito.",
      acao: "Só PDF entra. Converta o arquivo para PDF antes de subir, e confira a lista: os aceitos continuam selecionados, e só os recusados ficaram de fora.",
    },
    {
      sintoma: "O sistema responde Envie ao menos um PDF ou Apenas arquivos PDF são aceitos.",
      acao: "A lista de arquivos ficou vazia, ou algum arquivo não é PDF de verdade apesar do nome. Selecione os arquivos de novo e processe.",
    },
    {
      sintoma: "A tela mostra Falha ao processar o kit.",
      acao: "Nada foi separado. Confira se os arquivos abrem normalmente no seu computador, tire do lote o arquivo suspeito e processe de novo.",
    },
    {
      sintoma: "A mensagem fica em Aguardando disponibilidade por um bom tempo.",
      acao: "É espera, não erro: o motor divide o trabalho em lotes e respeita o limite de uso. Deixe a tela aberta, porque ela acompanha sozinha e a contagem de novas tentativas continua subindo até a vez chegar.",
    },
    {
      sintoma: "Saí da tela no meio do processamento.",
      acao: "O trabalho continua no servidor. Ao voltar à tela, o último resultado processado reaparece por algumas horas, sem precisar subir os arquivos de novo. Passado esse tempo, é processar outra vez.",
    },
    {
      sintoma: "O sistema mostra Falha ao carregar os kits ao abrir a tela.",
      acao: "A lista de tipos de vínculo não veio, então não há o que escolher. Recarregue a página, e se continuar, confira com a administração se o seu usuário tem o menu do Gerador De Kit liberado.",
    },
  ],
  regras: [
    "O tipo de vínculo é escolhido antes dos arquivos: é ele que diz quais documentos o sistema procura em cada página.",
    "Só arquivo PDF é aceito, e o mesmo arquivo não entra duas vezes no lote.",
    "O processamento roda no servidor, em lotes, e espera a vez quando o limite de uso é atingido. Espera não é falha.",
    "Quem define quais documentos entram em cada tipo de vínculo é o cadastro do kit, em outra tela, não esta.",
    "O resultado fica disponível por poucas horas depois de processado, e depois disso é preciso processar de novo.",
  ],
  relacionados: [
    "baixar-o-kit-de-um-funcionario",
    "reimportar-os-documentos-que-faltam",
    "enviar-o-kit-para-assinatura",
    "concluir-o-cadastro-e-o-contrato",
    "o-mapa-das-frentes-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerador-kit/page.tsx",
    "apps/backend/src/kit/kit.controller.ts",
    "apps/backend/src/kit/kit.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
