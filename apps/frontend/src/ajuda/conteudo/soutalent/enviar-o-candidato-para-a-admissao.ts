import type { Artigo } from "../../tipos";

/**
 * ─ A PONTE DE ATRAÇÃO E SELEÇÃO PARA A ESTEIRA ADMISSIONAL ─────────────────────────────────────
 *
 * ┌─ O QUE ESTE ARTIGO ENSINA, E ONDE ELE PARA ─────────────────────────────────────────────────┐
 * │ Ele ensina O GESTO e o que ele EXIGE (CPF válido, motivo, a ciência do e-mail que sai para o  │
 * │ candidato), e diz o que NASCE do outro lado, em uma frase: a pré-admissão entra aguardando    │
 * │ liberação. E PARA AÍ. Nada da esteira é ensinado aqui, porque já é ensinado lá: liberar,      │
 * │ recusar, mover da sala de espera e o link do portal têm artigo próprio, e a delegação vai por │
 * │ `relacionados`. Repetir aqui produziria duas versões da mesma aula, e a daqui envelheceria    │
 * │ primeiro, porque este artigo não é lido por quem trabalha na esteira.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O DETALHE QUE MAIS SURPREENDE QUEM OPERA, e por isso ele é passo e regra: o funil aceita pessoa
 * SEM CPF (o cadastro o faz opcional de propósito), e é AQUI, no envio, que o CPF passa a ser
 * exigido. A recusa chega depois de a decisão estar tomada, então o artigo manda conferir antes.
 *
 * O SEGUNDO: enviar dispara um E-MAIL com o link de envio de documentos para o candidato. O envio
 * para a admissão acontece mesmo quando o e-mail não sai, e a janela diz honestamente qual dos dois
 * casos é o seu antes de você confirmar.
 *
 * O QUE ELE **NÃO** COBRE: desfazer o envio (é passo do artigo de mover de etapa, na seção Voltar
 * Para A Seleção) e o envio em massa, que é outra peça.
 *
 * SEM ROTEIRO DE CAPTURA E SEM `print`: a janela traz o nome da pessoa e o destino do e-mail, e a
 * liberação dessa superfície para o motor de captura está em auditoria.
 */
export const artigo: Artigo = {
  slug: "enviar-o-candidato-para-a-admissao",
  titulo: "Enviar O Candidato Para A Admissão",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-funil",
  nivel: "N1",
  publico: "AMBOS",
  resumo:
    "Como mandar para a esteira admissional quem fechou o processo seletivo: o que o sistema exige antes, o e-mail que sai para o candidato, e o que nasce do outro lado.",
  termos: [
    "enviar para admissao",
    "mandar para admissao",
    "contratar",
    "contratado",
    "fechou a vaga",
    "passar para o adm",
    "abrir admissao",
    "link do portal",
    "documentos do candidato",
    "pre admissao",
  ],
  preRequisitos: [
    "A pessoa já precisa estar no funil desta vaga, com o processo em andamento.",
    "O cadastro dela já precisa ter CPF válido: o funil aceita gente sem CPF, o envio não.",
  ],
  passos: [
    {
      gesto: "Confira o CPF no cadastro da pessoa antes de abrir a decisão.",
      detalhe:
        "O CPF é a chave da admissão. Sem ele, o envio é recusado depois de a decisão estar tomada.",
    },
    {
      gesto: "Na linha da pessoa, abra a janela de decisão pelo ícone da coluna de ações.",
    },
    {
      gesto: "Na seção Enviar Para A Admissão, clique em Enviar para admissão.",
      print: {
        arquivo: "01-secao-enviar-para-a-admissao.png",
        legenda: "A seção Enviar Para A Admissão, separada da seção que tira a pessoa da vaga.",
      },
      detalhe:
        "O clique só abre o campo de motivo, e nada foi gravado ainda. Esta saída não tira a pessoa da vaga: a posição continua preenchida por ela.",
      controles: ["Enviar Para A Admissão", "Enviar para admissão"],
    },
    {
      gesto: "Leia o aviso do link do portal, no topo da caixa que abriu.",
      print: {
        arquivo: "02-aviso-do-link-e-motivo.png",
        legenda:
          "O aviso do link do portal, com o endereço mascarado, e o campo de motivo logo abaixo.",
      },
      detalhe:
        "Ele diz para onde o e-mail vai, com o endereço mascarado, ou diz que o link não vai sair e por quê. O envio para a admissão acontece nos dois casos.",
    },
    {
      gesto: "Escreva o motivo: o que fechou o processo e o que a admissão precisa saber.",
      detalhe:
        "O motivo é obrigatório também nesta saída, e é ele que a admissão vai ler do outro lado.",
    },
    {
      gesto: "Confirme na pergunta, que repete para onde o link vai antes de o e-mail sair.",
      detalhe: "É o último ponto de leitura antes de a credencial do candidato ser enviada.",
    },
    {
      gesto: "Confira a pill Enviado Para Admissão na coluna Situação da lista.",
      print: {
        arquivo: "03-pill-enviado-para-admissao.png",
        legenda: "A pill Enviado Para Admissão na coluna Situação da lista da vaga.",
      },
      detalhe:
        "O card Enviados Para Admissão da Central De Vagas passa a contar esta pessoa, e a posição da vaga segue preenchida por ela.",
      controles: ["Enviado Para Admissão", "Enviados Para Admissão"],
    },
    {
      gesto: "Siga do outro lado, na Liberação Admissional.",
      detalhe:
        "A pré-admissão nasce aguardando liberação, e é lá que ela recebe cliente e cargo e entra na esteira. O passo a passo é do artigo de liberar uma admissão.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema recusa o envio por causa do CPF.",
      acao: 'A frase é "Este candidato não tem CPF válido. Preencha o CPF antes de enviar para admissão." Corrija o cadastro da pessoa e repita o envio: a posição não foi consumida na recusa.',
    },
    {
      sintoma: "O aviso diz que o cadastro não tem e-mail.",
      acao: 'A frase é "O cadastro deste candidato não tem e-mail, então o link não vai sair. Cadastre o e-mail e envie o link pelo Gerenciador do Portal." O envio para a admissão acontece do mesmo jeito: o que falta é a credencial chegar ao candidato.',
    },
    {
      sintoma: "O aviso diz que o e-mail do cadastro não é válido.",
      acao: 'A frase é "O e-mail do cadastro não é um endereço válido, então o link não vai sair. Corrija o cadastro e envie o link pelo Gerenciador do Portal."',
    },
    {
      sintoma: "O aviso diz que o envio de e-mail ainda não está ligado.",
      acao: 'A frase é "O envio de e-mail ainda não está ligado no sistema, então o link não vai sair. Gere o link pelo Gerenciador do Portal e passe para o candidato." É configuração do sistema, e não defeito do cadastro.',
    },
    {
      sintoma: "O aviso diz que a pessoa já está com um link valendo.",
      acao: 'A frase é "O link deste candidato está valendo e ele já entrou no portal, então não precisa de um novo. Enviar outro agora encerraria o acesso que ele está usando." Nada falhou: não mexa, a pessoa está usando o acesso.',
    },
    {
      sintoma: "O aviso diz que não conseguiu conferir o destino do link.",
      acao: "A frase avisa que não foi possível conferir o destino agora e que o envio para a admissão acontece do mesmo jeito. Siga com o envio e confira depois, pelo Gerenciador do Portal, se a credencial saiu.",
    },
    {
      sintoma: "A seção Enviar Para A Admissão não aparece na janela.",
      acao: "A pessoa já está enviada. No lugar dela aparece a seção Voltar Para A Seleção, que é como se desfaz um envio errado.",
    },
  ],
  regras: [
    "Enviar para a admissão não é uma saída sem êxito: a pessoa continua ocupando a posição da vaga e avança para a esteira admissional.",
    "O envio exige CPF válido. O funil aceita pessoa sem CPF, e é neste gesto que o dado passa a ser necessário.",
    "O motivo é obrigatório, e é o que a admissão lê do outro lado.",
    "Enviar dispara, por e-mail, o link de envio de documentos para o candidato. Falha no e-mail não desfaz o envio.",
    "A pré-admissão nasce aguardando liberação: ela recebe cliente e cargo na Liberação Admissional antes de entrar na esteira.",
    "Enviar duas vezes não cria duas admissões: o sistema reconhece a admissão viva da mesma pessoa e da mesma vaga.",
    "Desfazer o envio é Voltar Para A Seleção, na mesma janela, e é de qualquer consultor.",
  ],
  relacionados: [
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "registrar-a-saida-do-candidato",
    "liberar-uma-admissao",
    "recusar-uma-admissao-na-liberacao",
    "gerar-o-link-do-portal-para-o-candidato",
    "acompanhar-a-conferencia-do-portal",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/MoverCandidaturaModal.tsx",
    "apps/frontend/src/components/portal/EnvioDoLink.tsx",
    "apps/frontend/src/lib/portal-envio-link.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
