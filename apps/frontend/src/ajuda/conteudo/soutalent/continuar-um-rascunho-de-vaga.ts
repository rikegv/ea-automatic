import type { Artigo } from "../../tipos";

/**
 * ─ CONTINUAR UM RASCUNHO DE VAGA: retomar o que ficou guardado e publicar ───────────────────────
 *
 * O QUE ESTA PEÇA COBRE: achar o rascunho, reabrir a trilha naquela MESMA vaga, escolher o status de
 * publicação, guardar de novo, e publicar.
 *
 * ┌─ ELA **NÃO** REEXPLICA A TRILHA, E ISSO É DECISÃO, NÃO ECONOMIA ─────────────────────────────┐
 * │ Os cinco passos e o que cada campo pede já estão em "abrir-uma-vaga-nova", escritos uma vez.  │
 * │ Repeti-los aqui criaria dois textos sobre a MESMA janela, corrigidos em épocas diferentes, que │
 * │ é exatamente a divergência silenciosa que a família existe para eliminar. Este artigo ensina o │
 * │ que é DIFERENTE no rascunho: a vaga é a mesma (o código volta com ela e nada é duplicado), o   │
 * │ botão de publicar tem outro nome, e o status de publicação é escolhido na trilha.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O RÓTULO QUE É FÁCIL DE ERRAR, e por isso está declarado ───────────────────────────────────┐
 * │ No rascunho o botão do último passo é "Publicar Vaga", e NÃO "Abrir Vaga": quem lê o artigo da │
 * │ abertura e vem para cá procura um botão com o nome errado. O rótulo foi lido do componente.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa aqui. NENHUM print é declarado: a captura da superfície de A&S está
 * vetada pela auditoria, e o texto foi escrito para funcionar sem imagem.
 */
export const artigo: Artigo = {
  slug: "continuar-um-rascunho-de-vaga",
  titulo: "Continuar Um Rascunho De Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-vagas",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como retomar uma vaga que você guardou pela metade, completar o que faltava e publicar, sem criar uma vaga duplicada.",
  termos: [
    "continuar rascunho",
    "vaga salva pela metade",
    "retomar vaga",
    "terminar de cadastrar vaga",
    "publicar rascunho",
    "vaga guardada",
    "editar rascunho de vaga",
    "onde esta o rascunho",
  ],
  preRequisitos: [
    "A vaga precisa estar em rascunho. Vaga publicada não volta para a trilha de abertura.",
  ],
  passos: [
    {
      gesto: "Encontre o rascunho na lista da Central De Vagas.",
      detalhe:
        "O card Rascunho, no topo, também é filtro: clique nele para deixar na tabela só as vagas guardadas. O rascunho pode ainda não ter código, e aí a linha se identifica pelo nome de divulgação.",
      controles: ["Rascunho"],
    },
    {
      gesto: "Clique em Gestão Da Vaga e depois em Continuar rascunho.",
      detalhe:
        "A trilha abre com tudo o que você já tinha preenchido, inclusive o código da vaga, porque é a mesma vaga sendo continuada.",
      controles: ["Continuar rascunho"],
    },
    {
      gesto: "Complete o que falta, passo por passo.",
      detalhe:
        "A janela é a mesma da abertura de vaga, com os mesmos passos e os mesmos campos, e nenhum passo trava o avanço. O que cada campo pede está no artigo de abrir uma vaga nova.",
    },
    {
      gesto: "Escolha o Status que a vaga vai ter quando for publicada.",
      detalhe:
        "A lista não oferece Rascunho, porque rascunho é o botão de guardar e não uma escolha de status, e também não oferece nada que encerre a vaga.",
      controles: ["Status"],
    },
    {
      gesto: "Ainda falta informação? Clique em Salvar Rascunho, em qualquer passo.",
      detalhe:
        "Salvar de novo atualiza a MESMA vaga. Guardar dez vezes não cria dez vagas, e o código que você já digitou não é acusado de duplicado.",
      controles: ["Salvar Rascunho"],
    },
    {
      gesto: "No último passo, clique em Publicar Vaga.",
      detalhe:
        "É aqui que os campos obrigatórios são cobrados, e não antes. A lista de pendências aparece no topo da janela e cada item é clicável: clique e o sistema leva você até o campo que falta.",
      controles: ["Publicar Vaga"],
    },
    {
      gesto: "Confira a linha na lista: o status saiu de Rascunho e passou a ser o que você escolheu.",
      detalhe: "Publicada, a vaga entra na fila de trabalho e passa a receber candidato.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Continuar rascunho não aparece na barra da vaga.",
      acao: "Só o rascunho volta para a trilha. Vaga publicada não é editada por esse caminho, e vaga que veio do Pandapé pendente de revisão sai pela liberação, que confere o cliente.",
    },
    {
      sintoma:
        "A tela mostra Esta vaga já foi publicada e não volta para a trilha de abertura. Recarregue a página.",
      acao: "A vaga foi publicada enquanto você estava com a tela aberta. Recarregue a página: para ajustar os contadores, use editar posições; para mudar de estado, use mover status.",
    },
    {
      sintoma: "O botão de publicar diz que faltam campos obrigatórios.",
      acao: "A mensagem lista tudo o que falta de uma vez, e cada item da lista no topo da janela leva você até o campo. Se ainda não tem a informação, clique em Salvar Rascunho e volte depois.",
    },
    {
      sintoma: "Salvei o rascunho duas vezes e temi ter criado duas vagas.",
      acao: "Não criou. Continuar um rascunho atualiza a mesma vaga, e a conferência de código duplicado ignora a própria vaga que está sendo salva.",
    },
    {
      sintoma: "Fechei a janela e o sistema perguntou se eu quero descartar.",
      acao: "Ele pergunta porque havia campo preenchido e não salvo. Escolha Continuar preenchendo para voltar ao formulário, ou Descartar para sair perdendo só o que ainda não tinha sido salvo. O que já estava guardado no rascunho continua lá.",
    },
    {
      sintoma: "O status Rascunho não aparece na lista de status da trilha.",
      acao: "É assim de propósito: rascunho é o botão Salvar Rascunho, não um status de escolha. O seletor guarda o status que a vaga vai ter ao ser publicada.",
    },
  ],
  regras: [
    "Continuar um rascunho atualiza a mesma vaga, nunca cria outra: o código da vaga volta com ela.",
    "Rascunho é vaga guardada, não vaga publicada: enquanto não for publicada, ela não entra na fila de trabalho.",
    "Rascunho pode ficar sem código, e a unicidade do código só é cobrada quando o número existe.",
    "Nenhum passo da trilha trava o avanço: a cobrança dos obrigatórios acontece só na publicação.",
    "No rascunho o botão do último passo se chama Publicar Vaga.",
    "Só o rascunho volta para a trilha de abertura. A vaga pendente de revisão sai pela liberação, e a vaga publicada muda por outros caminhos.",
    "Encerrar a vaga não é opção da trilha: esta janela guarda como rascunho ou publica, e nada mais.",
  ],
  relacionados: [
    "abrir-uma-vaga-nova",
    "clonar-uma-vaga",
    "mover-o-status-da-vaga",
    "revisar-uma-vaga-pendente-de-revisao",
    "abrir-o-painel-da-vaga",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/TrilhaDaVaga.tsx",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/frontend/src/lib/as-status-vaga.ts",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
