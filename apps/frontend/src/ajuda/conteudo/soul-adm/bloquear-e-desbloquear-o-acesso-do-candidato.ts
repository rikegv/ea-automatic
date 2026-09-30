import type { Artigo } from "../../tipos";

/**
 * N1 DO PORTAL: FECHAR E REABRIR O ACESSO SEM MEXER NO LINK.
 *
 * ┌─ POR QUE ISTO É ARTIGO PRÓPRIO, E NÃO UM PARÁGRAFO DO ACOMPANHAMENTO ────────────────────────┐
 * │ Quem quer fechar o acesso de alguém tenta, por instinto, emitir um link novo, e emitir link é  │
 * │ o OPOSTO de bloquear: entrega credencial nova em vez de fechar a porta. O artigo de             │
 * │ acompanhamento cita o cadeado em dois passos, dentro de uma leitura de funil; quem chega com a  │
 * │ pergunta "como eu tiro o acesso desta pessoa agora" precisa de uma peça que comece por aí, e    │
 * │ que diga na primeira linha que o link NÃO muda.                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA PEÇA DELIBERADAMENTE NÃO COBRE ─────────────────────────────────────────────────┐
 * │ EMITIR link (primeiro envio, reenvio, envio por e-mail) é o artigo "gerar-o-link-do-portal-para │
 * │ -o-candidato", e repetir aqui produziria duas aulas divergentes sobre o mesmo botão. A LEITURA  │
 * │ do funil e a fila de quem pediu ajuda são do artigo de acompanhamento. Aqui fica só o cadeado:  │
 * │ o que ele faz, quando ele não está disponível, e por que ele não pede confirmação.              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA FOI LIDA DO CÓDIGO, e não deduzida: só link "Ativo" se bloqueia e só link "Bloqueado" se
 * desbloqueia (`acaoDoLink`, em `lib/portal-painel.ts`); nos outros três estados o botão fica
 * apagado com o motivo escrito (`motivoSemAcaoDeLink`), e as três frases estão no bloco de erros
 * letra por letra.
 *
 * §A.6: o link é CREDENCIAL de acesso aos documentos do candidato. Nenhuma URL, nenhum trecho de
 * URL, nenhum nome, nenhum CPF e nenhum e-mail aparece neste arquivo.
 *
 * IMAGEM: pendência conhecida. A captura desta tela mostra gente, e a auditoria de segurança
 * recusou capturar as telas com pessoa enquanto a homologação não tiver dado sintético. O texto foi
 * escrito para funcionar sem imagem: cada passo nomeia o controle pelo rótulo que a tela usa.
 */
export const artigo: Artigo = {
  slug: "bloquear-e-desbloquear-o-acesso-do-candidato",
  titulo: "Bloquear E Desbloquear O Acesso Do Candidato",
  modulo: "SOUL_ADM",
  rotas: ["/admin/portal-links"],
  menus: ["portal-links"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "portal",
  resumo:
    "Como fechar o acesso do candidato ao portal sem trocar o link que ele já tem, como reabrir depois pelo mesmo link, e por que em alguns estados o cadeado fica apagado.",
  termos: [
    "bloquear acesso",
    "desbloquear",
    "tirar o acesso",
    "fechar o portal do candidato",
    "suspender acesso",
    "cadeado",
    "liberar de novo",
    "candidato nao pode mais enviar",
    "parar o envio de documentos",
    "cancelar o link",
    "revogar acesso",
    "botao apagado",
  ],
  preRequisitos: [
    "O candidato já precisa ter um link emitido. Sem link não há acesso a fechar, e o caminho é outro artigo: o de gerar o link.",
    "Saber a diferença entre fechar e trocar: bloquear mantém o link da pessoa e só impede que ele abra. Emitir um link novo faz o contrário, entrega um acesso novo e mata o anterior.",
  ],
  passos: [
    {
      gesto: "Abra o menu Portal Do Candidato e fique na vista Painel Do Portal.",
      detalhe:
        "O cadeado vive na tabela do painel, na linha de cada pessoa. As outras duas vistas da tela não têm essa ação.",
      controles: ["Portal Do Candidato", "Painel Do Portal"],
    },
    {
      gesto: "Ache a pessoa pela busca por nome, no topo da tela.",
      detalhe:
        "A busca é por nome do funcionário. Se ela estiver na parte já concluída da coleta, troque para a aba Concluído antes de procurar.",
      controles: ["Buscar por nome do funcionário", "Em Andamento", "Concluído"],
    },
    {
      gesto: "Confira a coluna Link antes de agir.",
      detalhe:
        "Ativo é o acesso de pé, e é o único estado em que dá para bloquear. Bloqueado é o que você já fechou, e é o único em que dá para reabrir. Vencido, Revogado e Acesso Bloqueado Temporariamente não aceitam a ação, e o cadeado fica apagado dizendo o motivo.",
      controles: [
        "Link",
        "Ativo",
        "Bloqueado",
        "Vencido",
        "Revogado",
        "Acesso Bloqueado Temporariamente",
      ],
    },
    {
      gesto: "Clique no cadeado, o último ícone da coluna Ações, para fechar o acesso.",
      detalhe:
        "O aviso do mouse diz Bloquear o acesso do candidato, sem trocar o link que ele já tem. Não há pergunta de confirmação, porque desfazer é um clique no mesmo lugar. O link da pessoa continua o mesmo: ele só para de abrir.",
      controles: ["Ações", "Bloquear o acesso do candidato, sem trocar o link que ele já tem"],
    },
    {
      gesto: "Confira que a coluna Link daquela linha passou a Bloqueado.",
      detalhe:
        "O painel não se atualiza sozinho. Clique em Atualizar se você quiser reler os números do topo depois de bloquear.",
      controles: ["Link", "Bloqueado", "Atualizar"],
    },
    {
      gesto: "Para reabrir, clique no mesmo botão, que agora é o de liberar.",
      detalhe:
        "É um botão só, que alterna: o aviso do mouse passa a ser Liberar de novo o acesso do candidato pelo mesmo link. A pessoa volta a entrar com o link que já estava na mão dela, sem precisar receber nada de novo.",
      controles: ["Liberar de novo o acesso do candidato pelo mesmo link", "Ativo"],
    },
    {
      gesto: "Para ver de uma vez todos os acessos fechados, filtre pelo estado do link.",
      detalhe:
        "Abra o ícone de filtro da barra e escolha Bloqueado no campo Link. O filtro aceita mais de um estado ao mesmo tempo, então dá para pedir Bloqueado e Vencido juntos.",
      controles: ["Link", "Bloqueado", "Vencido"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O cadeado está apagado e o aviso diz O bloqueio temporário é automático e passa sozinho. Gere um link novo para trocar o acesso.",
      acao: "O sistema já suspendeu aquele acesso por conta própria, depois de tentativas erradas de identificação, e essa suspensão passa sozinha. Não há o que bloquear: espere, ou emita um link novo se você quer trocar o acesso de vez.",
    },
    {
      sintoma:
        "O cadeado está apagado e o aviso diz O link venceu. Gere um link novo para o candidato voltar.",
      acao: "Link vencido já não abre, então bloquear não mudaria nada. Se a pessoa precisa voltar a enviar documento, emita um link novo; se ela não deve voltar, não faça nada, porque o acesso já está fechado pelo prazo.",
    },
    {
      sintoma:
        "O cadeado está apagado e o aviso diz O link foi revogado por uma emissão nova. Gere um link novo para o candidato voltar.",
      acao: "Aquele link morreu quando alguém emitiu outro para a mesma pessoa. Confira a linha: o acesso vivo dela é o link mais novo, e é sobre ele que o cadeado passa a agir.",
    },
    {
      sintoma:
        "O cadeado está apagado e o aviso diz Nenhum link vivo para bloquear. Gere um link primeiro.",
      acao: "Aquela pessoa não tem acesso de pé. Não há nada a fechar, e não é preciso agir.",
    },
    {
      sintoma:
        "A tela respondeu Falha ao bloquear o link do portal. ou Falha ao desbloquear o link do portal.",
      acao: "A chamada não completou e nada mudou. Clique em Atualizar, releia a coluna Link daquela pessoa e tente de novo.",
    },
    {
      sintoma: "Bloqueei e o candidato diz que o link dele continua abrindo.",
      acao: "Confira se a coluna Link mostra Bloqueado e se a pessoa não está com a tela antiga aberta no celular. Clique em Atualizar para reler o estado de agora. Se você precisa cortar o acesso de vez, emita um link novo: isso mata o link que ela tem.",
    },
    {
      sintoma: "Bloqueei a pessoa errada.",
      acao: "Clique no mesmo botão da linha, que agora libera, e o acesso volta pelo mesmo link. Nada foi perdido: bloquear não apaga nem troca o link.",
    },
  ],
  regras: [
    "Bloquear não troca nem cancela o link: o link que a pessoa tem continua o mesmo, e só para de abrir enquanto durar o bloqueio.",
    "Desbloquear devolve o acesso pelo mesmo link. A pessoa não precisa receber nada de novo.",
    "É um botão só, que alterna: ele bloqueia quem está com o acesso ativo e libera quem você bloqueou.",
    "Bloquear não pede confirmação, de propósito: desfazer é um clique no mesmo lugar.",
    "Só link ativo se bloqueia e só link bloqueado se libera. Vencido, revogado e suspensão automática não aceitam a ação, e o botão fica apagado dizendo por quê.",
    "A suspensão por tentativa errada de identificação é do sistema, passa sozinha e não tem botão para desfazer.",
    "Emitir um link novo é o caminho oposto: entrega acesso novo e mata o anterior. Quando a intenção é fechar, o caminho é o cadeado.",
  ],
  relacionados: [
    "gerar-o-link-do-portal-para-o-candidato",
    "acompanhar-a-conferencia-do-portal",
    "atender-a-fila-de-intervencao-humana",
    "destravar-o-acesso-por-e-mail",
    "filtrar-uma-lista",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/portal-links/page.tsx",
    "apps/frontend/src/lib/portal-painel.ts",
    "apps/backend/src/portal/portal-identidade.service.ts",
    "apps/backend/src/portal/portal-painel.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
