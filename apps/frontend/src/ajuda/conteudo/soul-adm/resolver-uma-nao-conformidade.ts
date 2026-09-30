import type { Artigo } from "../../tipos";

/**
 * ─ 4 de 5 DA FILA DE NÃO CONFORMIDADES: RESOLVER ───────────────────────────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: o botão de resolver, quando ele aparece, e o que sobra na linha depois.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ APROVAR E REPROVAR, que são os botões vizinhos. A diferença é a razão de o artigo existir     │
 * │ separado: resolver fecha a PENDÊNCIA e não mexe em responsabilidade nenhuma, e é justamente   │
 * │ essa a pergunta que todo mundo faz ao clicar ("resolvendo, sai do meu nome?"). A resposta é    │
 * │ não, e ela precisa caber em um artigo que não fale de mais nada.                              │
 * │                                                                                               │
 * │ Fica fora também o caso em que a linha espera decisão: ali resolver não some do caminho, mas  │
 * │ a etiqueta não muda, e o artigo avisa em vez de ensinar a decidir.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A captura desta tela está vetada enquanto a
 * homologação não tiver dado sintético, porque a fila mostra nome de colega na coluna de consultor.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "resolver-uma-nao-conformidade",
  titulo: "Resolver Uma Não Conformidade",
  modulo: "SOUL_ADM",
  rotas: ["/nao-conformidades"],
  menus: ["nao-conformidades"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nao-conformidades",
  resumo:
    "Como marcar uma não conformidade como resolvida depois de corrigir o que faltava, e o que continua valendo na linha depois disso.",
  termos: [
    "resolver nc",
    "fechar nc",
    "corrigi e agora",
    "dar baixa na nc",
    "nc resolvida",
    "tirar nc da fila",
    "resolver sai do meu nome",
    "nc continua aparecendo",
  ],
  preRequisitos: [
    "O que gerou o desvio já precisa estar corrigido de fato. Resolver aqui é o registro da correção, não a correção.",
  ],
  passos: [
    {
      gesto: "Corrija primeiro o que faltou, na tela onde aquilo se resolve.",
      detalhe:
        "Documento pendente se resolve na auditoria da admissão, exame sem laudo se resolve anexando o laudo, e cadastro incompleto se resolve no próprio cadastro. Esta fila registra, não corrige.",
    },
    {
      gesto: "Abra Não Conformidades pelo menu da lateral esquerda.",
      controles: ["Não Conformidades"],
    },
    {
      gesto: "Ache a linha da pessoa pela busca do topo.",
      detalhe: "A busca procura por nome, CPF e cliente ao mesmo tempo.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Clique em Resolver, na coluna Situação / ação daquela linha.",
      detalhe:
        "A confirmação NC resolvida (registro mantido no histórico). aparece acima da lista, e a fila recarrega sozinha.",
      controles: ["Resolver", "Situação / ação"],
    },
    {
      gesto: "Confira a etiqueta da linha, que passa a Resolvida.",
      detalhe:
        "O botão de resolver desaparece daquela linha, porque não há o que resolver duas vezes. A linha continua na fila como histórico e continua contada no quadro acima da lista.",
      controles: ["Resolvida"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão Resolver não aparece na linha.",
      acao: "Duas possibilidades: a linha já está Resolvida, ou ela está Liberada pela diretoria. Na segunda, a exceção já foi reconhecida pela supervisão e não há pendência a fechar.",
    },
    {
      sintoma: "Eu resolvi e a etiqueta continua em Aguardando supervisão.",
      acao: "É assim de propósito. Havendo um pedido de liberação em aberto, a etiqueta mostra a decisão que falta, que é a informação mais importante daquela linha. A resolução foi gravada e aparece quando a supervisão decidir.",
    },
    {
      sintoma: "Eu resolvi e o número do meu nome no quadro de contagem não caiu.",
      acao: "Está correto: resolver não tira a não conformidade da contagem, porque o desvio aconteceu. A única coisa que tira é a liberação aprovada pela diretoria.",
    },
    {
      sintoma: "A tela mostra Não conformidade não encontrada.",
      acao: "Aquele registro não existe mais ou a tela estava desatualizada. Recarregue a página e procure a linha de novo.",
    },
  ],
  regras: [
    "Resolver é o registro de que a correção foi feita, e não a correção em si.",
    "Resolver não muda de quem é a responsabilidade nem tira a linha da contagem do consultor.",
    "O registro permanece na fila depois de resolvido, como histórico consultável.",
    "Resolver duas vezes não faz nada: o segundo clique não altera o registro.",
    "Havendo pedido de liberação em aberto, a etiqueta da linha continua mostrando a decisão pendente.",
    "Resolver não exige papel de supervisão: quem tem a tela resolve.",
  ],
  relacionados: [
    "ler-a-fila-de-nao-conformidades",
    "aprovar-ou-reprovar-uma-nao-conformidade",
    "as-duas-vias-da-nao-conformidade",
    "registrar-uma-nc-de-cadastro",
    "auditar-os-documentos-da-admissao",
    "anexar-o-aso-no-exame",
    "concluir-o-cadastro-e-o-contrato",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nao-conformidades/page.tsx",
    "apps/backend/src/nao-conformidades/nao-conformidades.service.ts",
    "apps/backend/src/domain/nao-conformidade.ts",
  ],
  revisadoEm: "2026-09-30",
};
