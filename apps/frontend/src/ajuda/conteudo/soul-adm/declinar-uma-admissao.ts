import type { Artigo } from "../../tipos";

/**
 * N2 DO GERENCIADOR, O DESFECHO 1 de 3: DECLINAR. Os três desfechos (declinar, pausar, marcar como
 * banco) vivem no MESMO seletor de status da janela de edição, e foi por isso que eles foram lidos
 * de uma vez: escritos por cabeças diferentes, divergiriam sobre o mesmo controle.
 *
 * ┌─ O QUE ESTE ARTIGO COBRE, E O QUE ELE DE PROPÓSITO NÃO COBRE ─────────────────────────────────┐
 * │ COBRE o gesto de encerrar a admissão sem êxito e a consequência dele nas filas e nas contagens. │
 * │ NÃO cobre a PAUSA, que é artigo irmão: a distinção entre parar e encerrar é o coração dos dois, │
 * │ e explicá-la duas vezes é o jeito de as duas explicações divergirem. NÃO cobre a leitura da      │
 * │ coluna de status, que já é o artigo do farol, nem o formulário de edição campo a campo.         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONSEQUÊNCIA FOI MEDIDA NO CÓDIGO, NÃO AFIRMADA DE MEMÓRIA ────────────────────────────────┐
 * │ "Sai de toda fila e não conta em indicador nenhum" está verdadeiro para as filas de etapa e     │
 * │ para as contagens de PENDÊNCIA e de trabalho aberto: a fila das etapas exclui os dois faróis    │
 * │ de encerramento (`esteira.service.listar`, itens e indicadores), a expressão da pendência os    │
 * │ exclui (`admissoes-filtros.comPendenciaSql`), e o mesmo recorte aparece na fila de benefícios e │
 * │ na análise de Alto Volume. O QUE CONTINUA CONTANDO é o indicador que É sobre declínio (o card   │
 * │ Declínios e o total geral do Gerenciador), e isso é desenho, não exceção: é ele que faz o       │
 * │ encerrado seguir consultável. O texto do artigo diz exatamente isso, sem a palavra "nenhum" solta.│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E ISSO É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a captura das telas que mostram gente
 * está vetada pela auditoria de segurança enquanto a homologação não tiver arnês sintético. O texto
 * foi escrito para funcionar sem print: cada passo nomeia o rótulo literal do controle, e a ordem
 * dos passos é a ordem em que a janela os desenha.
 */
export const artigo: Artigo = {
  slug: "declinar-uma-admissao",
  titulo: "Declinar Uma Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como registrar que a admissão não vai acontecer, escolher o motivo, e o que muda no sistema depois disso: a pessoa sai das filas de trabalho e continua consultável como histórico.",
  termos: [
    "declinar",
    "declinou",
    "declinio",
    "candidato desistiu",
    "nao vai mais",
    "cancelar admissao",
    "desistencia",
    "desistiu da vaga",
    "rescisao",
    "encerrar admissao",
    "tirar da fila",
    "motivo do declinio",
    "nao quis a vaga",
    "candidato sumiu",
    "nao compareceu",
  ],
  preRequisitos: [
    "Saber o motivo da desistência: o sistema pede que você escolha um da lista.",
  ],
  passos: [
    {
      gesto: "Ache a pessoa na lista e clique no lápis, na coluna Ações.",
      detalhe:
        "Declinar é uma mudança de situação da admissão, então ela é feita pelo formulário de edição, e não pela ficha de leitura.",
      controles: ["Ações", "Editar", "Editar admissão"],
    },
    {
      gesto: "Desça até o bloco Status das frentes e abra o seletor Status (farol).",
      controles: ["Status das frentes", "Status (farol)"],
    },
    {
      gesto: "Escolha Declinou, ou Rescisão quando a pessoa já havia sido admitida.",
      detalhe:
        "Declinou é quem desistiu antes de a admissão se concretizar. Rescisão é quem já estava admitido e saiu. As duas encerram a admissão do mesmo jeito para o sistema, e a diferença é o que aconteceu na vida real.",
      controles: ["Declinou", "Rescisão"],
    },
    {
      gesto: "Escolha o motivo no campo Motivo do declínio, que aparece ao lado.",
      detalhe:
        "O campo só existe depois que você escolhe um status de encerramento. A lista de motivos é um catálogo mantido pela administração, então ela é a mesma para todo mundo.",
      controles: ["Motivo do declínio", "Selecione o motivo…"],
    },
    {
      gesto: "Clique em Salvar alterações.",
      detalhe:
        "A lista recarrega e avisa que a admissão foi atualizada. Cancelar fecha sem gravar nada.",
      controles: ["Cancelar", "Salvar alterações"],
    },
    {
      gesto: "Confira a linha: a coluna Status passa a ler Declinou, ou Rescisão.",
      detalhe:
        "Na coluna Pendências Obrig. a etiqueta vira Declínio, e ela não lê mais Completo nem Parcial: caso encerrado não tem pendência de processo vivo.",
      controles: ["Status", "Pendências Obrig.", "Declínio"],
    },
    {
      gesto: "Para reencontrar quem foi encerrado, clique no card Declínios do topo.",
      detalhe:
        "Ele é um filtro, e mostra os encerrados por desistência e por rescisão juntos. O campo Status do painel de filtro faz o mesmo recorte, e aceita mais de um valor ao mesmo tempo.",
      controles: ["Declínios", "Status"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor Motivo do declínio abre sem nenhuma opção para escolher.",
      acao: "A lista de motivos é um catálogo da administração, e ela está vazia. Peça o cadastro dos motivos antes de registrar o declínio, senão a admissão fica encerrada sem o porquê.",
    },
    {
      sintoma: "Escolhi Declinou e não achei onde informar o motivo.",
      acao: "O campo do motivo nasce ao lado do seletor, e só depois que um status de encerramento está escolhido. Se ele não apareceu, confira se o seletor ficou mesmo em Declinou ou Rescisão.",
    },
    {
      sintoma: "Salvei o declínio e a pessoa continua na fila da etapa em que estava.",
      acao: "A sua tela está velha. Recarregue a página: as filas das etapas leem a situação da admissão, e o encerrado sai delas.",
    },
    {
      sintoma: "Declinei a pessoa errada.",
      acao: "Ajuste o status pelo mesmo lápis e salve. Depois abra a ficha pelo olho: o declínio e a correção ficam no histórico de alterações, com o seu nome e a data, e o registro não se apaga pela tela.",
    },
    {
      sintoma: "A admissão encerrada sumiu do card de pendências e eu esperava contá-la ali.",
      acao: "É assim de propósito: quem encerrou não deixa trabalho a fazer, então não conta como pendência em tela nenhuma. Quem conta o encerramento é o card Declínios.",
    },
    {
      sintoma: "A pessoa voltou a ser contratada e eu não acho como reaproveitar a admissão antiga.",
      acao: "Não é pelo declínio: a admissão encerrada fica como histórico. Quem volta entra como processo novo, e o sistema oferece reaproveitar os dados da pessoa pelo CPF na hora de cadastrar.",
    },
  ],
  regras: [
    "Declínio é encerramento, não pausa: a admissão sai das filas de trabalho das três etapas e não volta sozinha.",
    "Quem declinou não conta como pendência obrigatória em nenhuma tela, nem nos cards, nem na fila de benefícios, nem na análise de projeto. Quem o conta é o card Declínios, que existe para isso.",
    "O encerrado continua consultável no Gerenciador, com Declínio na coluna de pendências. Ele nunca lê Completo nem Parcial ali.",
    "Declinar não apaga nada: exame, documentos, datas e prontuário ficam exatamente como estavam.",
    "Declinou e Rescisão são escolha de gente, e a automação do sistema não as reescreve depois.",
    "O motivo sai de um catálogo mantido pela administração, para todo mundo classificar do mesmo jeito.",
    "O declínio e o motivo ficam registrados no histórico de alterações da admissão, com autor e data.",
    "Quem declinou, se voltar a ser contratado, é processo novo do zero. Não há religar a admissão encerrada como se ela tivesse continuado.",
  ],
  relacionados: [
    "pausar-e-retomar-uma-admissao",
    "excluir-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
    "achar-uma-admissao-no-gerenciador",
    "ler-a-ficha-da-admissao",
    "reaproveitar-um-candidato-pelo-cpf",
    "filtrar-pelo-card-de-indicador",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/EditAdmissaoModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/lib/farol.ts",
    "apps/frontend/src/lib/pendencias-pill.ts",
    "apps/backend/src/admissoes/admissoes-filtros.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
