import type { Artigo } from "../../tipos";

/**
 * FICHA: as duas decisões da fila de Divergências Da Ingestão.
 *
 * COBRE a diferença que importa entre os dois botões, e ela não é de preferência: manter o valor do
 * sistema FECHA a linha sem escrever nada no dado, enquanto adotar o valor do Pandapé ESCREVE, com
 * o nome de quem clicou e registro na trilha. É por isso que só o segundo pede confirmação, e é a
 * primeira coisa que a peça diz.
 *
 * COBRE também os campos que NÃO são adotáveis por aqui, porque essa é a dúvida que a tela gera
 * sozinha: a linha mostra um aviso no lugar do botão, e sem explicação a pessoa acha que perdeu
 * permissão. Não perdeu: aquele campo se corrige no lugar onde ele é editado de verdade.
 *
 * NÃO COBRE a leitura das colunas nem dos indicadores, que é do artigo irmão em `relacionados`.
 *
 * NÃO COBRE o passo a passo de mover a pessoa de etapa, de registrar a saída dela ou de devolver a
 * vaga para revisão. Cada um desses tem artigo próprio, e repeti-los aqui criaria uma segunda
 * versão do mesmo ensino, que é o que mais envelhece num manual.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: a mesma da peça de leitura. Sem a leitura automática configurada no
 * servidor, nenhuma diferença é detectada e não há linha para decidir.
 */
export const artigo: Artigo = {
  slug: "resolver-uma-divergencia-da-ingestao",
  titulo: "Resolver Uma Divergência Da Ingestão",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/divergencias-ingestao"],
  menus: ["divergencias-ingestao"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "saude-da-ingestao",
  resumo:
    "Como fechar uma divergência: manter o valor que está no sistema ou adotar o valor que veio do Pandapé, o que cada decisão escreve, e por que alguns campos se corrigem em outra tela.",
  termos: [
    "resolver divergencia",
    "manter o ea",
    "adotar o pandape",
    "aceitar o valor do pandape",
    "fechar divergencia",
    "decidir qual valor vale",
    "tirar da fila de divergencia",
    "corrigir etapa do candidato",
  ],
  preRequisitos: [
    "Ter conferido na origem qual dos dois valores está certo antes de decidir: a decisão não tem desfazer nesta tela.",
  ],
  passos: [
    {
      gesto: "Abra Divergências Da Ingestão e escolha a linha pendente que você vai decidir.",
      detalhe:
        "As pendentes vêm primeiro na lista, e as mais recentes no topo. Só linha pendente oferece os botões de decisão.",
      controles: ["Divergências Da Ingestão", "Pendentes"],
    },
    {
      gesto: "Compare Valor No EA e Valor No Pandapé e decida qual dos dois está certo.",
      detalhe:
        "O da esquerda é o que vale hoje no sistema. O da direita é o que a leitura automática trouxe e não foi aplicado.",
      controles: ["Valor No EA", "Valor No Pandapé", "Ocorrências"],
    },
    {
      gesto: "Estando certo o valor do sistema, clique no botão de manter o EA, na coluna Ações.",
      detalhe:
        "Ele fecha a linha e não altera nada no dado. É o clique que se usa também depois de corrigir alguma coisa à mão em outra tela.",
      controles: ["Ações", "Manter o EA"],
    },
    {
      gesto: "Estando certo o valor do Pandapé, clique no botão de adotar o Pandapé.",
      detalhe:
        "Abre uma janela de confirmação mostrando de qual valor para qual valor a mudança vai acontecer.",
      controles: ["Adotar o Pandapé", "Adotar O Pandapé"],
    },
    {
      gesto: "Leia a confirmação e clique em Adotar o Pandapé para aplicar.",
      detalhe:
        "A mudança acontece pelo caminho normal do sistema, com o seu nome como autor e registro na trilha. Enquanto você não confirmar, nada é alterado. Para desistir, use o Cancelar.",
      controles: ["Cancelar"],
    },
    {
      gesto: "Confira o aviso acima da tabela e veja a linha sair da fila.",
      detalhe:
        "Resolvida, ela deixa a lista padrão e passa a aparecer só no recorte de Resolvidas, com a etiqueta da decisão e o nome de quem decidiu.",
      controles: ["Resolvidas", "Mantido O EA", "Adotado O ATS"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "No lugar do botão de adotar aparece um aviso dizendo para resolver na ficha do candidato.",
      acao: "A saída do funil se registra na ficha do candidato, escolhendo o motivo do catálogo, e não por esta fila. Concordando com o Pandapé, registre a saída na ficha e depois feche esta linha com o botão de manter o EA.",
    },
    {
      sintoma: "No lugar do botão de adotar aparece um aviso dizendo para resolver em Editar vaga.",
      acao: "O nome e a cidade da vaga se corrigem em Editar vaga, na Central de Vagas, enquanto a vaga estiver aberta ou entregue. O código é a identidade da vaga no Pandapé e não se edita. Corrija a vaga por lá e depois feche esta linha com o botão de manter o EA.",
    },
    {
      sintoma: "Você adotou o valor errado e quer voltar atrás.",
      acao: "Não há desfazer nesta tela: a mudança foi aplicada pelo caminho normal do sistema. Corrija o dado na tela onde ele é editado, do mesmo jeito que você corrigiria qualquer outro engano, e o registro da decisão fica na trilha.",
    },
    {
      sintoma: "Você resolveu a linha e ela voltou a aparecer depois.",
      acao: "É uma detecção nova da mesma diferença, porque a origem continua com o valor antigo. Corrija no Pandapé, senão a linha volta em cada leitura.",
    },
  ],
  regras: [
    "Manter o valor do sistema fecha a linha e não altera nada no dado.",
    "Adotar o valor do Pandapé aplica a mudança de verdade, com o nome de quem clicou e registro na trilha.",
    "Só a adoção pede confirmação, porque só ela escreve.",
    "Nem todo campo é adotável por aqui: quando não é, a linha diz em que tela aquele campo se corrige.",
    "Resolvida, a linha sai da fila e passa a aparecer no recorte de resolvidas.",
  ],
  relacionados: [
    "ler-a-fila-de-divergencias-da-ingestao",
    "ler-a-fila-de-entradas-do-pandape",
    "mover-o-candidato-de-etapa",
    "registrar-a-saida-do-candidato",
    "revisar-uma-vaga-pendente-de-revisao",
    "trocar-a-vaga-do-candidato",
  ],
  fontes: [
    "apps/frontend/src/components/admin/divergencias/FilaDeDivergencias.tsx",
    "apps/frontend/src/components/admin/divergencias/AdotarDivergenciaModal.tsx",
    "apps/frontend/src/lib/divergencias-ingestao.ts",
    "apps/backend/src/as/ingestao-pandape/ingestao-divergencias.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
