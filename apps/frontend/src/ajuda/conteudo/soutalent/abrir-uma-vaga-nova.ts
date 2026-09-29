import type { Artigo } from "../../tipos";

/**
 * ARTIGO PILOTO 2 (Fase 0), o da Central De Vagas. Mesmo formato do piloto da esteira.
 *
 * O ARTIGO DIZ QUAL IMAGEM E O QUE ELA MOSTRA. ONDE AS SETAS VÃO é assunto do roteiro irmão
 * (`capturas/abrir-uma-vaga-nova.roteiro.ts`), e lá está escrito por que a imagem do botão de
 * publicar é a única dos pilotos apontada por seletor, e não por papel e nome.
 *
 * ┌─ O `controles` ENTROU DEPOIS, E ELE COBRE A TRILHA, NÃO A TELA INTEIRA ───────────────────────┐
 * │ Piloto: nasceu antes do campo, e o detector o media como N1 MUDO. Os rótulos abaixo saíram do   │
 * │ componente, com a caixa que a tela usa, e a distinção mais fácil de errar é a do botão: a LISTA  │
 * │ tem "Abrir vaga" (comando, escrita normal) e o RODAPÉ da trilha tem "Abrir Vaga" (o publicar).   │
 * │ São dois controles diferentes com o mesmo nome falado, e os dois estão declarados.               │
 * │                                                                                                 │
 * │ O QUE ESTE ARTIGO **NÃO** DECLARA, e é decisão de escopo (§A.31): as colunas e os contadores do  │
 * │ funil da Central De Vagas (etapa, entregues, descartados, alocados, SLA). Eles não estão no       │
 * │ caminho de ABRIR uma vaga, e declará-los aqui compraria cobertura medida com aula que o artigo    │
 * │ não dá. Eles pedem artigo próprio, e seguem órfãos até existir.                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "abrir-uma-vaga-nova",
  titulo: "Abrir Uma Vaga Nova",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  /*
   * N1: caminho principal. Quem ler só os N1 do módulo consegue trabalhar. O N2 é o recurso
   * secundário, e os três pilotos são N1 de propósito: eles existem para validar o FORMATO.
   */
  nivel: "N1",
  resumo:
    "Como cadastrar uma abertura de vaga do começo ao fim, passo por passo, e como guardar o que já foi preenchido quando ainda falta informação.",
  termos: [
    "abrir vaga",
    "nova vaga",
    "cadastrar vaga",
    "criar vaga",
    "abertura de vaga",
    "processo seletivo",
    "codigo da vaga",
    "posicoes",
    "requisicao",
    "rascunho de vaga",
    "publicar vaga",
  ],
  preRequisitos: [
    "Ter o menu Central De Vagas liberado para o seu usuário.",
    "Saber o número do processo seletivo desta abertura: ele é o código da vaga e não se repete.",
    "Ter o cliente e o cargo já cadastrados no sistema.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Vagas pelo menu da lateral esquerda.",
      controles: ["Central De Vagas"],
    },
    {
      gesto: "Clique em Abrir vaga, no canto superior direito da tela.",
      detalhe: "A janela abre no primeiro de cinco passos, e a posição aparece sempre no rodapé.",
      controles: ["Abrir vaga"],
      print: {
        arquivo: "01-botao-abrir-vaga.png",
        legenda: "Passo 2: o botão de abrir vaga, ao lado da busca e dos filtros.",
      },
    },
    {
      gesto:
        "Preencha o passo A Vaga: cliente, código da vaga, nome de divulgação, cargo e número de posições.",
      detalhe:
        "O número de posições de banco é opcional e fica separado das posições oficiais, porque banco não é vaga aberta.",
      controles: [
        "A Vaga",
        "Cliente",
        "Código da vaga",
        "Nome de divulgação",
        "Cargo",
        "Nº de posições oficiais",
        "Nº de posições de banco",
      ],
      print: {
        arquivo: "02-passo-a-vaga.png",
        legenda: "Passo 3: o primeiro passo da janela, com cliente, código e posições.",
      },
    },
    {
      gesto:
        "Clique em Continuar e preencha Quem Pediu: solicitante, contato e as datas da abertura.",
      detalhe: "Nenhum passo trava o avanço, então você pode seguir e voltar quando quiser.",
      controles: [
        "Continuar",
        "Quem Pediu",
        "Nome do solicitante ou contato focal",
        "Data de abertura",
        "Previsão de entrega",
        "Voltar",
      ],
    },
    {
      gesto: "Siga por Contratação, Condições e Requisitos, nessa ordem.",
      detalhe:
        "Em Contratação, escolher substituição como motivo abre o campo de justificativa. Em Condições entram salário e benefícios, e em Requisitos o perfil de quem você procura.",
      controles: [
        "Contratação",
        "Condições",
        "Requisitos",
        "Vínculo",
        "Motivo da contratação",
        "Justificativa do motivo",
        "Salário de abertura",
      ],
      print: {
        arquivo: "03-passos-da-trilha.png",
        legenda: "Passo 5: o botão que leva ao passo seguinte, no rodapé da janela.",
      },
    },
    {
      gesto: "No último passo, clique em Abrir Vaga para publicar.",
      detalhe: "É aqui que o sistema cobra os campos obrigatórios, e não antes.",
      controles: ["Abrir Vaga", "Salvar Rascunho"],
      print: {
        arquivo: "04-botao-publicar.png",
        legenda: "Passo 6: o rodapé da janela no último passo, com guardar rascunho e publicar.",
      },
    },
    {
      gesto: "Confira a vaga na lista, com o código que você digitou.",
      detalhe: "Use a busca do topo: ela procura em qualquer coluna da tabela.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema recusa o código da vaga.",
      acao: "O código é o número do processo seletivo e é único no sistema. Confira se aquela abertura já foi cadastrada antes e use o número desta abertura, mesmo que o cliente e o cargo sejam os mesmos de outra.",
    },
    {
      sintoma: "Ainda não tenho todas as informações da vaga.",
      acao: "Clique em Salvar Rascunho, em qualquer passo. A vaga fica guardada com o que você preencheu e aparece na lista para continuar depois.",
    },
    {
      sintoma: "O botão de publicar diz que faltam campos obrigatórios.",
      acao: "A lista de pendências aparece no topo da janela e cada item é clicável: clique e o sistema leva você até o campo que falta.",
    },
    {
      sintoma: "Fechei a janela por engano e achei que tinha perdido tudo.",
      acao: "A janela não fecha por clique fora. Ela sai pelo Cancelar, e antes de descartar o sistema pergunta se você quer mesmo perder o que preencheu.",
    },
    {
      sintoma: "O botão de publicar não aparece.",
      acao: "Ele só aparece no último passo. Use o Continuar até chegar em Requisitos.",
    },
  ],
  regras: [
    "Cada abertura de vaga tem o seu próprio código, mesmo quando o cliente e o cargo se repetem.",
    "Nenhum passo trava o avanço: a cobrança dos campos obrigatórios acontece só na publicação.",
    "Rascunho é vaga guardada, não vaga publicada: ela não entra na fila de trabalho enquanto não for publicada.",
    "Posições de banco ficam contadas separadas das posições oficiais.",
  ],
  relacionados: [],
  fontes: [
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/frontend/src/components/as/vagas/TrilhaDaVaga.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-27",
};
