import type { Artigo } from "../../tipos";

/**
 * N1 DO PORTAL 1 de 2: EMITIR E REENVIAR O LINK.
 *
 * ┌─ SÃO DUAS PORTAS, E QUEM NÃO SABE DISSO SÓ ACHA UMA ────────────────────────────────────────┐
 * │ A tabela do painel mostra quem JÁ TEM link. Quem nunca recebeu nenhum não está nela, e por isso  │
 * │ existe o botão "Copiar ou enviar link" na barra, que abre uma busca por nome só de quem está sem │
 * │ link. Esse botão já foi secundário e escrito "Enviar link", e nessa forma ninguém descobria que  │
 * │ era por ali que se atendia o primeiro envio. O artigo ensina as duas portas, nessa ordem.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COPIAR E ENVIAR POR E-MAIL SÃO IRMÃOS, E UM DELES SE ABSTÉM ───────────────────────────────┐
 * │ Os dois emitem link novo e matam o anterior. A diferença que muda decisão: o de COPIAR se abstém │
 * │ quando o candidato está com o portal aberto naquele instante, e devolve "O Candidato Já Está     │
 * │ Usando O Link" em tom neutro. Isso NÃO é erro, e o artigo precisa dizer isso com todas as        │
 * │ letras: apresentar a proteção como falha é o começo do pedido para desligá-la.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o link é CREDENCIAL de acesso aos documentos do candidato. Nenhuma URL, nenhum nome e nenhum
 * CPF aparece neste arquivo, e o artigo ensina que o link aparece UMA vez e some ao fechar a janela.
 */
export const artigo: Artigo = {
  slug: "gerar-o-link-do-portal-para-o-candidato",
  titulo: "Gerar O Link Do Portal Para O Candidato",
  modulo: "SOUL_ADM",
  rotas: ["/admin/portal-links"],
  menus: ["portal-links"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "portal",
  resumo:
    "Como emitir o link que o candidato usa para enviar os documentos pelo celular, copiar para mandar pelo canal que você preferir ou enviar por e-mail, e o que fazer quando o sistema se abstém de trocar o link.",
  termos: [
    "link do portal",
    "gerar link",
    "mandar link",
    "reenviar link",
    "enviar documentos",
    "candidato manda documento",
    "link expirou",
    "link venceu",
    "copiar link",
    "enviar por email",
    "whatsapp do candidato",
    "portal do candidato",
    "coleta de documentos",
  ],
  preRequisitos: [
    "Ter o cadastro do candidato com e-mail, se você for usar o envio por e-mail. Sem e-mail, o caminho é copiar o link e mandar pelo canal que o time já usa.",
  ],
  passos: [
    {
      gesto: "Abra o menu Portal Do Candidato e fique na vista Painel Do Portal.",
      detalhe:
        "É a tela do time, não a do candidato. A outra vista, Pedidos De Ajuda Para Entrar, é a fila de quem travou e é assunto do artigo de acompanhamento.",
      controles: ["Gerenciador Do Portal", "Painel Do Portal", "Pedidos De Ajuda Para Entrar"],
      print: {
        arquivo: "01-barra-do-painel.png",
        legenda: "Passo 1: a barra do Gerenciador Do Portal, com a busca e os dois botões.",
      },
    },
    {
      gesto: "Para quem nunca recebeu link, clique em Copiar ou enviar link.",
      detalhe:
        "A tabela lista só quem já tem link, então é por este botão que se atende o primeiro envio. Ele abre uma busca por nome com as admissões vivas que ainda estão sem link nenhum.",
      controles: ["Copiar ou enviar link", "Enviar Link Do Portal", "Buscar por nome do candidato"],
      print: {
        arquivo: "02-janela-do-primeiro-envio.png",
        legenda: "Passo 2: a janela Enviar Link Do Portal, com os dois caminhos por pessoa.",
      },
    },
    {
      gesto: "Na linha da pessoa, escolha Copiar link ou Enviar por e-mail.",
      detalhe:
        "Copiar link vale sempre: ele mostra a URL para você mandar pelo canal que preferir. Enviar por e-mail manda direto do servidor, e o botão fica apagado quando não dá, dizendo o motivo no aviso do mouse. Depois do primeiro, o rótulo do botão passa a ser Gerar de novo.",
      controles: ["Copiar link", "Gerar de novo", "Enviar por e-mail", "Enviado", "Copiar", "Copiado"],
    },
    {
      gesto: "Para quem já está na tabela, use os dois ícones da coluna Ações.",
      detalhe:
        "O ícone de elo gera o link e mostra a URL para copiar. O ícone de seta manda o link por e-mail. Os dois emitem link novo, e o anterior deixa de valer no mesmo instante.",
      controles: [
        "Ações",
        "Gerar o link do portal e copiar. O anterior deixa de valer, e se o candidato estiver usando o link dele agora o sistema avisa e não troca",
        "Enviar o link do portal por e-mail para o candidato",
      ],
      print: {
        arquivo: "03-acoes-da-linha.png",
        legenda: "Passo 4: os quatro botões da coluna Ações, na linha do candidato.",
      },
    },
    {
      gesto: "Copie o link na janela que abre, antes de fechá-la.",
      detalhe:
        "O título é Link Do Portal e o texto diz até quando ele vale. O link aparece UMA vez: ele some desta tela quando você fecha a janela. Perdeu, é só emitir outro, que é barato e mata o anterior.",
      controles: ["Link Do Portal", "Link do portal", "Copiar", "Copiado", "Fechar"],
    },
    {
      gesto: "No envio por e-mail, leia o desfecho na janela.",
      detalhe:
        "Link Do Portal Enviado diz para qual destino mascarado o link foi e até quando vale. O Link Não Foi Enviado explica o motivo e o que fazer no lugar. A URL não aparece aqui de propósito: ela foi direto ao candidato pelo servidor.",
      controles: ["Link Do Portal Enviado", "O Link Não Foi Enviado", "Fechar"],
    },
    {
      gesto: "Confira a coluna Link e a coluna Origem da linha depois de emitir.",
      detalhe:
        "Link mostra o estado do acesso: Ativo, Vencido, Revogado, Bloqueado ou Acesso Bloqueado Temporariamente. Origem diz como o último link saiu: Automático, Manual ou Entrega À Mão. Link antigo pode não ter origem, e a célula diz não informado.",
      controles: [
        "Link",
        "Ativo",
        "Vencido",
        "Revogado",
        "Origem",
        "Automático",
        "Manual",
        "Entrega À Mão",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela respondeu O Candidato Já Está Usando O Link.",
      acao: "Não é falha: o candidato está com o portal aberto agora, e o sistema se absteve de derrubar a sessão dele. Peça para ele usar o link que já tem. Se for mesmo preciso trocar, tente de novo depois que ele sair.",
    },
    {
      sintoma: "A janela respondeu Nenhum Link Novo Foi Gerado.",
      acao: "O texto logo abaixo diz o motivo e o que fazer. O mais comum é o link ter sido entregue agora há pouco e continuar valendo: peça para a pessoa usar o que já recebeu.",
    },
    {
      sintoma: "A linha mostra a etiqueta Sem E-mail ou E-mail Inválido.",
      acao: "O envio por e-mail não vai sair. Corrija o e-mail no cadastro do candidato, ou use Copiar link e mande pelo canal que o time já usa.",
    },
    {
      sintoma: "A linha mostra a etiqueta Envio Indisponível.",
      acao: "O envio de e-mail não está ligado no sistema. Gere o link pelo botão de copiar e passe para o candidato por outro canal.",
    },
    {
      sintoma: "A linha mostra a etiqueta Sem Admissão.",
      acao: "A admissão daquela pessoa ainda não existe no sistema, então não há régua de documentos a cobrar. Assim que a admissão nascer, volte aqui e envie o link.",
    },
    {
      sintoma:
        "Cliquei em Copiar e apareceu Não foi possível copiar automaticamente. Selecione o texto do campo e copie com Ctrl+C.",
      acao: "Faça exatamente isso: clique dentro do campo do link, que ele se seleciona sozinho, e copie com Ctrl+C.",
    },
    {
      sintoma: "A tela mostra Falha ao gerar o link do portal. ou Falha ao enviar o link do portal.",
      acao: "A chamada não completou e nada mudou. Clique em Atualizar, confira a coluna Link daquela pessoa e tente de novo.",
    },
    {
      sintoma: "Fechei a janela sem copiar o link.",
      acao: "O link some da tela ao fechar, de propósito. Emita outro pelo mesmo botão: o anterior deixa de valer e ninguém fica com dois acessos vivos.",
    },
  ],
  regras: [
    "Emitir um link novo mata o anterior. O candidato fica sempre com um acesso vivo, nunca com dois.",
    "O link aparece uma vez só e some ao fechar a janela. Ele é credencial de acesso aos documentos da pessoa, e não fica guardado em tela nenhuma.",
    "O sistema se abstém de trocar o link quando o candidato está com o portal aberto naquele instante. Abster-se é o comportamento certo, não é erro.",
    "Copiar e enviar por e-mail são caminhos irmãos: um entrega a URL para você mandar, o outro manda direto. Os dois emitem link novo.",
    "A tabela mostra só quem já tem link. Quem nunca recebeu nenhum é atendido pelo botão Copiar ou enviar link, na barra do topo.",
    "O link tem prazo de validade, e a janela diz até quando ele vale. Link vencido não abre, e o caminho é emitir outro.",
  ],
  relacionados: [
    "acompanhar-a-conferencia-do-portal",
    "ler-a-ficha-da-admissao",
    "buscar-dentro-da-tela",
    "filtrar-uma-lista",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/portal-links/page.tsx",
    "apps/frontend/src/components/portal/EnviarLinkModal.tsx",
    "apps/frontend/src/lib/portal-envio-link.ts",
    "apps/backend/src/portal/portal-envio.service.ts",
    "apps/backend/src/portal/portal-emissor.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
