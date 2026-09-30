import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA CADASTRO: A ETIQUETA DA ASSINATURA NA LINHA, E SÓ ELA.
 *
 * ┌─ O RECORTE, E ELE É FIRME: AQUI SE LÊ, NÃO SE AGE ───────────────────────────────────────────┐
 * │ Disparar o contrato, cancelar, trocar o kit e reenviar por correção vivem na tela de Gestão Das  │
 * │ Assinaturas, que tem artigo próprio. Nesta aba a assinatura é INDICADOR: ela diz em que ponto o  │
 * │ contrato está, para quem trabalha o cadastro decidir se cobra ou se espera. Ensinar a agir aqui   │
 * │ mandaria a pessoa procurar botão que esta linha não tem.                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS COISAS QUE A TELA FAZ E QUE NINGUÉM ADIVINHA ───────────────────────────────────────┐
 * │ 1. SEM ENVELOPE NÃO DESENHA NADA. O estado existe no sistema e é escondido de propósito na      │
 * │    linha: linha sem etiqueta é linha sem contrato enviado, e não linha com defeito.             │
 * │ 2. A ETIQUETA SÓ EXISTE NA ABA CADASTRO. Nas outras quatro abas ela não é desenhada, mesmo com   │
 * │    o contrato em assinatura.                                                                    │
 * │ 3. O ATALHO DO DRIVE É OUTRO CONTROLE, e ele aparece pelo ARQUIVO existir, não pela etiqueta:    │
 * │    há linha com o atalho e sem etiqueta, e ela está correta.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE SUSTENTA O ATALHO, e vale dizer a quem confere contrato ──────────────────────────────┐
 * │ O sistema nunca arquiva como contrato assinado um arquivo sem assinatura: ele confere o arquivo  │
 * │ antes de guardar e, não sendo o assinado, não guarda e tenta de novo no ciclo seguinte. Então o  │
 * │ atalho existir é, por construção, o contrato assinado estar no prontuário.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a fila mostra nome de pessoa, então a captura fica suspensa enquanto
 * a homologação não tiver dado sintético. O texto funciona sem imagem.
 *
 * §A.6: nenhum dado de pessoa. O atalho do Drive carrega o nome do candidato no rótulo acessível, e
 * o que se declara em `controles` é a parte estável, o texto do botão.
 */
export const artigo: Artigo = {
  slug: "acompanhar-o-envelope-na-aba-cadastro",
  titulo: "Acompanhar O Envelope Na Aba Cadastro",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "Como ler, na linha da aba Cadastro, em que ponto está a assinatura do contrato: o que cada etiqueta diz, por que algumas linhas não têm etiqueta nenhuma e quando aparece o atalho para o contrato assinado.",
  termos: [
    "assinatura do contrato",
    "envelope",
    "aguardando assinatura",
    "contrato assinado",
    "contrato no drive",
    "assinado",
    "expirado",
    "cancelado",
    "sem envelope",
    "candidato nao assinou",
    "onde esta o contrato",
    "ja enviou para assinar",
  ],
  preRequisitos: [
    "Estar na aba Cadastro: a etiqueta da assinatura não é desenhada nas outras abas.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e vá para a aba Cadastro.",
      controles: ["Esteira Admissional", "CADASTRO"],
    },
    {
      gesto: "Procure a etiqueta da assinatura na linha da pessoa.",
      detalhe:
        "Ela fica junto dos controles da linha, ao lado do atalho do prontuário quando ele existe. Linha sem etiqueta é linha sem contrato enviado ainda, e não linha com problema.",
    },
    {
      gesto: "Leia Aguardando Assinatura como contrato enviado e não assinado.",
      detalhe:
        "O envelope está com o candidato. É o estado em que faz sentido cobrar a assinatura, e não reenviar: reenviar antes cria contrato novo para o mesmo caso.",
      controles: ["Aguardando Assinatura"],
    },
    {
      gesto: "Leia Assinado como contrato fechado.",
      detalhe:
        "A assinatura entrou e o contrato foi arquivado no prontuário. É aqui que aparece o atalho para o arquivo.",
      controles: ["Assinado"],
    },
    {
      gesto: "Leia Cancelado e Expirado como envelope que não vale mais.",
      detalhe:
        "Cancelado é envelope encerrado, normalmente para corrigir algo e mandar de novo. Expirado é prazo vencido sem ninguém assinar. Nos dois, o contrato precisa ser reenviado, e isso é feito na tela de assinaturas.",
      controles: ["Cancelado", "Expirado"],
    },
    {
      gesto: "Clique em Contrato no Drive para abrir o arquivo assinado.",
      detalhe:
        "O atalho abre o contrato no prontuário, em outra aba do navegador. Ele aparece quando o arquivo assinado já foi arquivado, e é a prova de que ele está lá: o sistema não arquiva contrato sem assinatura.",
      controles: ["Contrato no Drive"],
    },
    {
      gesto: "Não fique recarregando a tela para ver a etiqueta mudar.",
      detalhe:
        "O sistema confere a situação dos envelopes sozinho, de tempo em tempo, e a etiqueta acompanha. Não há nada a acionar nesta aba para atualizar o estado da assinatura.",
    },
    {
      gesto:
        "Para rever quem já concluiu o cadastro e ainda não assinou, filtre pelo status de conclusão.",
      detalhe:
        "Cadastro concluído sai da fila padrão desta aba, mesmo com a assinatura pendente, então a linha não está mais na lista do dia. Ela continua na busca desta mesma aba, no Gerenciador e na tela de assinaturas.",
      controles: ["Status"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A linha não tem etiqueta de assinatura nenhuma.",
      acao: "O contrato ainda não foi enviado para assinatura daquela pessoa. O estado de sem envelope é escondido na linha de propósito, para a fila não ficar coberta de etiqueta que não informa nada.",
    },
    {
      sintoma: "A etiqueta diz Assinado e o atalho Contrato no Drive não apareceu.",
      acao: "O arquivo assinado ainda não terminou de ser arquivado no prontuário. O sistema tenta de novo no ciclo seguinte; confira outra vez em alguns minutos antes de reportar.",
    },
    {
      sintoma: "O atalho Contrato no Drive apareceu e a etiqueta não diz Assinado.",
      acao: "Está correto: o atalho aparece porque existe arquivo assinado guardado, e a etiqueta conta a situação do envelope. É o caso de contrato assinado e envelope depois encerrado.",
    },
    {
      sintoma: "A etiqueta está em Aguardando Assinatura há dias.",
      acao: "O envelope está com o candidato e ninguém assinou. A cobrança e o reenvio são feitos na tela de Gestão Das Assinaturas; esta aba só mostra a situação.",
    },
    {
      sintoma: "Procuro a etiqueta na aba Auditoria, no Exame ou na Integração e não encontro.",
      acao: "Ela existe só na aba Cadastro. Para ver a situação da assinatura de qualquer pessoa, use a tela de Gestão Das Assinaturas.",
    },
    {
      sintoma: "A pessoa sumiu da fila e eu queria acompanhar a assinatura dela.",
      acao: "Cadastro concluído sai da fila desta aba mesmo com a assinatura pendente. Ela não saiu do sistema: procure pelo nome na busca desta aba, filtre pelo status de conclusão, ou vá direto à tela de Gestão Das Assinaturas.",
    },
    {
      sintoma: "Cliquei na etiqueta esperando abrir o contrato e nada aconteceu.",
      acao: "A etiqueta é só informação, ela não é botão. O que abre arquivo é o atalho Contrato no Drive, ao lado dela.",
    },
  ],
  regras: [
    "A etiqueta da assinatura existe só na aba Cadastro.",
    "São quatro etiquetas possíveis na linha: Aguardando Assinatura, Assinado, Cancelado e Expirado.",
    "Sem envelope não desenha etiqueta: linha sem etiqueta é contrato ainda não enviado.",
    "A etiqueta é leitura. Disparar, cancelar e reenviar acontecem na tela de Gestão Das Assinaturas.",
    "O atalho Contrato no Drive aparece quando o contrato assinado já foi arquivado no prontuário.",
    "O sistema nunca arquiva como assinado um arquivo sem assinatura: ele confere antes de guardar e, na dúvida, não guarda e tenta de novo.",
    "O sistema confere a situação dos envelopes por conta própria, de tempo em tempo: não há o que acionar nesta aba.",
    "Cadastro concluído sai da fila desta aba mesmo com a assinatura pendente, e a admissão continua no Gerenciador, na busca da aba e na tela de assinaturas.",
  ],
  relacionados: [
    "concluir-o-cadastro-e-o-contrato",
    "ler-a-gestao-das-assinaturas",
    "abrir-o-prontuario-no-drive",
    "o-mapa-das-frentes-da-admissao",
    "achar-uma-admissao-no-gerenciador",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/lib/clicksign.ts",
    "apps/backend/src/domain/contrato-assinado.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
