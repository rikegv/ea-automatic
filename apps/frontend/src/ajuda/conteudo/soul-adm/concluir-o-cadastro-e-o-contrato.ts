import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA CADASTRO: o caminho principal, e a pergunta que a aba mais recebe.
 *
 * ┌─ A DÚVIDA QUE ESTE ARTIGO EXISTE PARA MATAR ─────────────────────────────────────────────────┐
 * │ "A pessoa está na aba e eu não consigo mexer em nada." Não é defeito: o Cadastro só abre depois │
 * │ que Auditoria e Exame fecham (§A.3, regra 3), e enquanto não abre a coluna Status mostra          │
 * │ "Aguardando" em vez do status real. Isso é LEITURA DE TELA, deliberada: dizer "A Cadastrar" ali   │
 * │ mentiria, porque não há nada a cadastrar ainda. O passo 2 e a primeira regra existem para a       │
 * │ pessoa não abrir chamado por um bloqueio que é o desenho do fluxo.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A SEGUNDA DÚVIDA, QUE PARECE BUG E É DECISÃO ────────────────────────────────────────────┐
 * │ Concluído o cadastro, a linha SAI da fila mesmo com a assinatura pendente (decisão do diretor,  │
 * │ 20/08/2026, §A.5). Quem não sabe disso conclui, vê a pessoa desaparecer com o contrato em        │
 * │ assinatura e acha que perdeu o registro. O artigo diz onde ela continua estando, em vez de       │
 * │ deixar a pessoa procurar.                                                                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU FORA ──────────────────────────────────────────────────────────────────────────┐
 * │ Gerar o kit, disparar o envelope e reenviar por correção não moram nesta aba: são outras telas, │
 * │ com artigo próprio quando chegar a vez delas. Aqui a assinatura aparece só como ETIQUETA a ser   │
 * │ lida na linha, que é o que a aba oferece de verdade.                                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O seletor de status da linha fica sem `controles` pelo mesmo motivo dos outros artigos desta
 * família: o nome acessível dele carrega o nome da pessoa (§A.6).
 */
export const artigo: Artigo = {
  slug: "concluir-o-cadastro-e-o-contrato",
  titulo: "Concluir O Cadastro E O Contrato",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como trabalhar a fila do Cadastro: entender por que ela só abre depois da Auditoria e do Exame, lançar a matrícula, marcar a admissão como cadastrada e acompanhar a etiqueta da assinatura do contrato.",
  termos: [
    "cadastro",
    "cadastrar",
    "contrato",
    "matricula",
    "folha",
    "cadastrado",
    "a cadastrar",
    "nao consigo cadastrar",
    "aguardando",
    "travado",
    "assinatura",
    "assinar contrato",
    "aguardando assinatura",
    "contrato assinado",
    "importar matricula",
    "planilha de matricula",
    "concluir admissao",
  ],
  preRequisitos: [
    "A Auditoria e o Exame da mesma admissão já precisam estar concluídos: é isso que abre esta frente.",
    "Ter a matrícula da pessoa em mãos, ou a planilha de matrículas que a folha devolve.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba Cadastro.",
      controles: ["Esteira Admissional", "Farol Admissional", "CADASTRO"],
      print: {
        arquivo: "01-aba-cadastro.png",
        legenda: "Passo 1: a aba Cadastro aberta, com a fila da frente na tela.",
      },
    },
    {
      gesto: "Antes de tudo, olhe a coluna Status de quem você quer trabalhar.",
      detalhe:
        "Quando aparece Aguardando, a frente ainda não abriu: falta a Auditoria ou o Exame concluir. Na coluna de avanço, no lugar do seletor, a tela diz Pausado e o que está sendo esperado. Não há nada a fazer ali, e nada do que já foi lançado se perde.",
      controles: ["Status", "Aguardando", "Pausado: aguarda Auditoria + Exame", "Avanço"],
    },
    {
      gesto: "Digite o nome, o CPF ou o cliente na busca do topo para achar a pessoa.",
      detalhe: "A busca filtra a fila enquanto você digita.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Confira a coluna Matrícula da linha.",
      detalhe:
        "Ela é o número que a folha usa, e fica logo antes do nome. Vazia, a célula diz não informado em letra apagada. Esta é a única aba que mostra essa coluna, porque é aqui que a matrícula é lançada.",
      controles: ["Matrícula", "não informado"],
    },
    {
      gesto:
        "Para lançar muitas matrículas de uma vez, clique no ícone de planilha ao lado do filtro.",
      detalhe:
        "Ele abre a importação da planilha que a folha devolve, em xlsx ou csv. O botão existe só nesta aba, porque é aqui que o trabalho acontece. Para uma matrícula só, use o lápis da linha.",
      /*
       * Os quatro primeiros são o botão da barra (aria-label e aviso do mouse) e o título da janela
       * que ele abre; "casaram" e "Não Casaram" são os dois blocos da prévia, e é por eles que a
       * pessoa descobre o que vai ser gravado ANTES de gravar.
       */
      controles: [
        "Importar matrículas de uma planilha",
        "Importar matrículas de uma planilha (xlsx ou csv)",
        "Importar Matrículas",
        "Escolher planilha",
        "casaram",
        "Não Casaram",
        "Editar admissão",
      ],
      print: {
        arquivo: "02-importar-matriculas.png",
        legenda: "Passo 5: o ícone de planilha que abre a importação de matrículas.",
      },
    },
    {
      gesto:
        "Com o cadastro feito no sistema da folha, abra o seletor da coluna Avanço e escolha Cadastrado.",
      detalhe:
        "A frente tem dois status só: A Cadastrar, que é como ela nasce, e Cadastrado, que é o que conclui. O sistema pede uma confirmação antes de fechar.",
      controles: ["A Cadastrar", "Cadastrado", "Concluir Frente", "Concluir"],
      print: {
        arquivo: "03-seletor-de-status.png",
        legenda: "Passo 6: o seletor de status da frente na coluna de avanço.",
      },
    },
    {
      gesto: "Leia a etiqueta de assinatura que aparece na linha.",
      detalhe:
        "Aguardando Assinatura é envelope enviado e ainda não assinado. Assinado é contrato fechado, e aí surge o atalho Contrato no Drive na mesma linha. Quando não existe envelope nenhum, a etiqueta não é desenhada.",
      controles: ["Aguardando Assinatura", "Assinado", "Cancelado", "Expirado", "Contrato no Drive"],
    },
    {
      gesto: "Para rever quem você já concluiu, clique no card Cadastrado no alto da tela.",
      detalhe:
        "Concluir tira a linha da fila, então esse card é o caminho de volta. Clicar de novo desliga o filtro.",
      controles: ["Cadastrado", "Total na fila", "Com pendências obrigatórias"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa está na aba com o status Aguardando e o seletor não existe.",
      acao: "A frente ainda não abriu. Confira a Auditoria e o Exame da mesma pessoa nas abas delas: quando as duas concluírem, o Cadastro reabre sozinho e o trabalho já lançado continua ali.",
    },
    {
      sintoma: "Concluí o cadastro e a pessoa desapareceu da fila, mas a assinatura está pendente.",
      acao: "É o comportamento correto: cadastro concluído sai desta fila. A admissão continua no sistema, na Gestão Das Assinaturas, no Gerenciador e na busca por candidato desta própria aba.",
    },
    {
      sintoma: "Ao concluir, o sistema pediu que eu me declarasse ciente de pendências.",
      acao: "Há campo obrigatório da admissão ainda em branco. Você pode avançar assumindo o aceite, que fica registrado com seu nome e a data, ou cancelar, clicar na etiqueta da coluna Pendências Obrig. e preencher o que falta.",
    },
    {
      sintoma: "Preciso desfazer a conclusão do cadastro.",
      acao: "Escolha o status anterior no mesmo seletor. Quando o recuo desfaz algo que já andou, o sistema pede confirmação antes de aplicar: leia o aviso, porque ele diz o que está sendo desfeito.",
    },
    {
      sintoma: "A matrícula continua vazia depois da importação da planilha.",
      acao: "A janela da importação separa, antes de gravar, quantas linhas casaram e quais não casaram, com o motivo de cada uma. A planilha precisa ter o CPF e a matrícula, uma pessoa por linha. Corrija a linha apontada e importe de novo, ou lance aquela matrícula pelo lápis.",
    },
    {
      sintoma: "A etiqueta da assinatura diz Expirado ou Cancelado.",
      acao: "Aquele envelope não vale mais e o contrato precisa ser reenviado. Isso é feito na tela de assinaturas, não aqui: esta aba só mostra a situação.",
    },
  ],
  regras: [
    "O Cadastro só abre depois que a Auditoria e o Exame fecham. Enquanto não abrem, a coluna Status mostra Aguardando e a linha não avança.",
    "Auditoria e Exame correm em paralelo entre si, e a ordem em que fecham não importa: o que conta é as duas terem fechado.",
    "O trabalho de uma frente fechada não é perdido pela espera da outra: a frente de Cadastro reabre sozinha quando o caminho libera.",
    "A frente de Cadastro tem dois status: A Cadastrar, como ela nasce, e Cadastrado, que é o que conclui.",
    "Cadastro concluído sai da fila desta aba mesmo com a assinatura pendente. A admissão não sai do sistema.",
    "A integração e a credencial de ponto correm em paralelo e não seguram a conclusão do cadastro.",
    "Concluir com campo obrigatório pendente exige aceite explícito, e o aceite fica registrado com autor e data.",
    "O contrato assinado é arquivado no Drive, e o atalho para ele fica na própria linha da fila.",
  ],
  relacionados: [
    "auditar-os-documentos-da-admissao",
    "anexar-o-aso-no-exame",
    "acompanhar-a-integracao",
    "importar-uma-planilha",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/ImportarMatriculasModal.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/esteira/nascimento-cadastro.ts",
  ],
  revisadoEm: "2026-09-28",
};
