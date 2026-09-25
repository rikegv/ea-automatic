import type { MotivoDeRecusaDeEnvio } from "@ea/shared-types";
import { emailValido } from "./assinante-empresa";

/**
 * O ENVIO DO LINK DO PORTAL, CAMADA PURA: mascaramento do destino, régua do que é enviável, a
 * frase da recusa e o corpo do e-mail. Sem Nest, sem banco, sem rede.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE SEPARADO DO SERVIÇO ───────────────────────────────────────────┐
 * │ Três das quatro coisas aqui dentro são REGRAS DE §A.6 que a auditoria vai reler linha por    │
 * │ linha: o que aparece no lugar do endereço (S6), o que a mensagem de erro pode dizer (S11) e  │
 * │ o que o corpo do e-mail NÃO pode conter. Regra de PII provada dentro de um serviço com banco │
 * │ e rede só é provável por quem tiver ambiente; aqui ela é função pura e o teste a executa     │
 * │ sozinho, que é a mesma razão de `domain/portal-evento.ts` existir.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * `f****o@empresa.com`. O DESTINO QUE A TELA MOSTRA, e o único que ela pode mostrar.
 *
 * ELE É DERIVADO NA HORA, do cadastro, e NUNCA persistido (exigência S6 da auditoria: endereço em
 * claro em qualquer tabela é veto). A máscara existe porque a prévia do lote precisa deixar o
 * consultor RECONHECER o destino sem exibi-lo: um e-mail desatualizado no cadastro entrega o
 * prontuário de um candidato a um terceiro sem que nada falhe, e é ele que tem de saltar aos olhos.
 *
 * ┌─ A CONTA DE ATÉ 3 LETRAS NÃO REVELA NADA, e esse é o caso que costuma escapar ──────────────┐
 * │ A máscara ingênua ("primeira + asteriscos + última") aplicada a `ab@x.com` devolve           │
 * │ `a****b@x.com`, que é a conta INTEIRA com enfeite no meio: nada foi escondido. Em conta de   │
 * │ uma letra é pior, porque a mesma letra aparece duas vezes.                                   │
 * │                                                                                              │
 * │ O CORTE É EM TRÊS, E NÃO EM DOIS, por achado da auditoria: `ana@x.com` viraria `a****a`, que │
 * │ expõe 2 das 3 letras e deixa UMA por adivinhar. Chamar isso de máscara é pior do que não     │
 * │ mascarar, porque a tela afirma que escondeu. Até três caracteres a conta some por completo,  │
 * │ e o que sobra é o domínio, que é o que permite reconhecer o destino sem identificar a        │
 * │ pessoa. De quatro em diante a máscara esconde a maioria das letras e o formato volta a valer.│
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O DOMÍNIO NÃO É MASCARADO, de propósito: é ele que responde "foi para o Gmail dele ou para o
 * e-mail corporativo do cliente?", que é a pergunta que o consultor faz olhando a prévia. Mascarar
 * o domínio deixaria a lista inteira parecida e mataria o valor da conferência.
 *
 * Nulo, vazio ou sem `@` devolve `null`: não há destino a mostrar, e inventar um texto no lugar
 * faria a tela parecer ter endereço quando não tem.
 */
export function mascararEmail(email: string | null | undefined): string | null {
  const limpo = (email ?? "").trim();
  if (!limpo) return null;

  const corte = limpo.lastIndexOf("@");
  if (corte <= 0 || corte === limpo.length - 1) return null;

  const conta = limpo.slice(0, corte);
  const dominio = limpo.slice(corte + 1);

  if (conta.length <= 3) return `****@${dominio}`;
  return `${conta[0]}****${conta[conta.length - 1]}@${dominio}`;
}

/**
 * ESTE E-MAIL DÁ PARA ENVIAR? `null` é sim; qualquer outra coisa é o código da recusa.
 *
 * DOIS CÓDIGOS E NÃO UM, porque as duas situações pedem gestos DIFERENTES de quem opera: `SEM_EMAIL`
 * é "ninguém preencheu, vá preencher"; `EMAIL_INVALIDO` é "tem alguma coisa escrita ali e ela está
 * errada, vá corrigir". Um código só faria o consultor abrir o cadastro para descobrir qual dos
 * dois é.
 *
 * A RÉGUA DO QUE É VÁLIDO É A DE `domain/assinante-empresa.ts`, REUSADA E NÃO REESCRITA. Uma
 * segunda expressão regular de e-mail neste repositório divergiria da primeira no dia em que uma
 * das duas fosse ajustada, e o efeito seria o pior possível: um endereço aceito aqui e recusado na
 * hora do envio, ou o inverso. Ela é deliberadamente simples, e é o provedor quem valida de
 * verdade; o que ela pega é o campo em branco com espaço dentro e o "não tem" digitado à mão.
 */
export function emailEnviavel(email: string | null | undefined): MotivoDeRecusaDeEnvio | null {
  const limpo = (email ?? "").trim();
  if (!limpo) return "SEM_EMAIL";
  return emailValido(limpo) ? null : "EMAIL_INVALIDO";
}

/**
 * A FRASE DA RECUSA, PARA A TELA. Ela NUNCA ecoa o endereço (exigência S11 da auditoria).
 *
 * ┌─ POR QUE A FRASE É MONTADA AQUI E NÃO NO LUGAR ONDE A RECUSA ACONTECE ──────────────────────┐
 * │ A lista de falhas do lote é feita para ser COPIADA: o consultor seleciona, cola no WhatsApp  │
 * │ do time e pede ajuda. Uma frase montada com o endereço dentro ("não enviou para              │
 * │ fulano@x.com") põe dado pessoal num relatório que vai parar em três aplicativos, sem que     │
 * │ ninguém tenha decidido isso. Com a frase vindo de uma função que NÃO RECEBE o endereço, não  │
 * │ há como ela vazar: o argumento é o CÓDIGO, e só ele.                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: sem travessão, em nenhuma delas.
 */
export function avisoDaRecusa(motivo: MotivoDeRecusaDeEnvio | null): string {
  switch (motivo) {
    case "SEM_EMAIL":
      return "Sem e-mail no cadastro. Preencha o e-mail do candidato e envie de novo.";
    case "EMAIL_INVALIDO":
      return "O e-mail do cadastro não é válido. Corrija o endereço e envie de novo.";
    case "SEM_ADMISSAO":
      return "Esta pessoa ainda não tem admissão aberta, então não há para onde prender o link. Assim que a admissão existir, o envio fica disponível.";
    case "CANAL_INDISPONIVEL":
      return "O envio por e-mail ainda não está configurado neste ambiente, então nada foi enviado e nenhum link foi gerado.";
    case "FALHA_NO_ENVIO":
      return "O e-mail não saiu. O link foi cancelado para não ficar valendo sem ninguém ter recebido. Tente de novo.";
    case "LINK_VIVO_EM_USO":
      return "Esta pessoa já tem um link ativo e já entrou por ele. Nada foi enviado, para não derrubar o envio que está em andamento.";
    /*
     * A FRASE É DIFERENTE DA DE CIMA, e é por isso que os dois códigos existem separados: aqui o
     * candidato AINDA NÃO ENTROU e o e-mail está na caixa dele agora. O que o consultor precisa
     * ouvir é "já saiu, espere", e não "ele já entrou, não mexa", que o mandaria procurar uma
     * sessão de upload que não existe.
     */
    case "ENVIADO_HA_POUCO":
      /*
       * A FRASE FALA EM "ENTREGUE", E NÃO EM "ENVIADO POR E-MAIL", desde que a janela passou a
       * cobrir as duas entregas (o e-mail e o "gerar link"). Dizer "procure o e-mail" a quem
       * recebeu a URL pelo WhatsApp mandaria a pessoa olhar uma caixa onde nunca chegou nada, e
       * quem lê a frase é o CONSULTOR, que sabe qual das duas ele acabou de fazer.
       */
      return "O link desta pessoa foi entregue agora há pouco e ainda está valendo. Peça para ela usar o link que já recebeu; para gerar outro, aguarde alguns minutos.";
    /*
     * O `default` COBRE SÓ O `null`, e ele deixou de ser o esconderijo da abstenção.
     *
     * Enquanto `LINK_VIVO_EM_USO` não existia no contrato, a recusa mais comum das seis caía AQUI,
     * com `motivo` nulo: a tela não tinha como distinguir "não precisa, o link dela está vivo" de
     * "não sei o que houve", e um teste independente mediu isso. Agora ela tem código próprio, e o
     * que sobra neste ramo é o que de fato não tem motivo declarado.
     *
     * A FRASE É GENÉRICA DE PROPÓSITO: adivinhar um motivo aqui seria dizer à pessoa uma coisa que
     * o sistema não sabe. Os seis códigos são um `case` cada, então motivo NOVO que esqueça de
     * passar por aqui cai numa frase honestamente vaga, e não numa frase errada.
     */
    default:
      return "O envio não aconteceu e o sistema não registrou um motivo. Tente de novo; se repetir, acione o suporte.";
  }
}

/**
 * ══ A JANELA DO REENVIO (item b da exigência S15) ═════════════════════════════════════════════
 *
 * ┌─ O QUE ELA CONSERTA, e é o furo que a auditoria deixou registrado como "meio cumprido" ─────┐
 * │ A abstenção que já existia cobre o link vivo JÁ ABERTO. O link vivo AINDA NÃO ABERTO ficou   │
 * │ de fora de propósito (reenviar para quem não recebeu é o gesto mais comum da operação), e    │
 * │ nessa fresta cabia o clique duplo: dois cliques seguidos emitiam DOIS links e mandavam DOIS  │
 * │ e-mails, e o segundo REVOGA o primeiro. O candidato recebe duas mensagens e a primeira, que  │
 * │ é a que ele provavelmente abre, não funciona mais. Nada falha e nada aparece em log nenhum.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TRÊS MINUTOS, e a escolha é do meio da faixa que o coordenador abriu (2 a 5). O que a janela
 * precisa cobrir é o acidente: o clique duplo (milissegundos), a retentativa de rede (segundos) e
 * o "será que foi?" de quem não viu o aviso da tela (dezenas de segundos até um minuto ou dois).
 * O que ela NÃO pode atrapalhar é a DECISÃO: "o candidato ligou dizendo que não achou o e-mail,
 * mande de novo", que acontece minutos ou horas depois e continua funcionando. Dois minutos
 * deixariam de fora o segundo clique de quem foi conferir a caixa de entrada antes de insistir;
 * cinco começam a atrapalhar quem está ao telefone com o candidato. Três cobre o acidente inteiro
 * e devolve o controle rápido.
 *
 * ══ O CRITÉRIO É "HOUVE ENTREGA RECENTE", E NÃO "HOUVE E-MAIL RECENTE" (correção do achado 14) ═
 *
 * A primeira versão desta janela contava do carimbo do ENVIO (`portal_links.enviado_em`), que só o
 * caminho do e-mail escreve. Sobrou uma fresta do tamanho do defeito que a janela existe para
 * fechar, e ela tem os dois botões LADO A LADO na mesma coluna de Ações: o consultor clica em
 * "gerar link" (que carimba `ENTREGA_A_MAO` e deixa `enviado_em` NULO, porque nada foi enviado),
 * entrega a URL pelo WhatsApp e, segundos depois, clica em "enviar por e-mail". A janela não
 * disparava, a emissão nova REVOGAVA o link recém-entregue, e a pessoa do outro lado ficava com
 * uma URL morta na mão sem nada ter falhado.
 *
 * O QUE A JANELA PROTEGE NÃO É O E-MAIL: é a CREDENCIAL QUE JÁ ESTÁ COM O CANDIDATO. Pouco importa
 * se ela chegou lá por e-mail ou pela mão do consultor; o estrago do segundo link é idêntico. Por
 * isso o critério passa a ser o INSTANTE DA ENTREGA, e o carimbo que serve às duas entregas já
 * estava na linha:
 *
 *   ENTREGA À MÃO: a entrega acontece no INSTANTE DA EMISSÃO, porque é aí que a URL é devolvida na
 *   tela e não existe segundo momento (ela não é persistida e não volta nunca mais). O carimbo é
 *   `criado_em`.
 *
 *   ENTREGA POR E-MAIL: `criado_em` também serve, e é MELHOR que `enviado_em`. A linha nasce e o
 *   e-mail sai poucos milissegundos depois, então os dois carimbos são praticamente o mesmo
 *   instante; a diferença é que `criado_em` já existe DENTRO da transação que emitiu, enquanto
 *   `enviado_em` só é escrito DEPOIS de o correio aceitar a mensagem. Era nesse vão que cabia o
 *   clique duplo de verdade: dois envios simultâneos, o segundo lia a linha do primeiro com
 *   `enviado_em` ainda NULO e reemitia, matando o link do e-mail que estava saindo. Contar da
 *   criação fecha também esse pedaço, que é o que a auditoria tinha deixado como "meio cumprido".
 *
 * `instanteDaEntrega` prefere `enviado_em` quando ele existe (é a entrega de verdade, e por ser
 * POSTERIOR à criação a janela fica ligeiramente mais protetora), e cai em `criado_em` quando não
 * existe, que é o caso da entrega à mão e o da corrida acima.
 *
 * QUEM GANHA A COBERTURA É SÓ O ENVIO POR E-MAIL. O "gerar link" continua passando direto
 * (`recusarSeJaAcessado = false` em `emitirLink`), e isso é deliberado: ele é a válvula de escape
 * de quando alguma coisa trava, e é ela que garante que não existe estado em que o time fique sem
 * conseguir entregar um link. Ligar a janela lá fecharia a saída de emergência para fechar uma
 * porta que já está fechada do lado que importa.
 */
export const JANELA_DE_REENVIO_MS = 3 * 60_000;

/**
 * O e-mail deste link saiu HÁ POUCO? Sem carimbo, a resposta é NÃO (nunca foi enviado).
 *
 * Carimbo no FUTURO (relógio torto, dado semeado) conta como dentro da janela: a direção segura
 * aqui é ABSTER-SE, porque o preço de errar para o outro lado é matar um link que acabou de ser
 * entregue a alguém.
 */
export function enviadoHaPouco(
  enviadoEm: Date | string | null | undefined,
  agoraMs: number,
): boolean {
  if (!enviadoEm) return false;
  const carimbo = new Date(enviadoEm).getTime();
  if (Number.isNaN(carimbo)) return false;
  return agoraMs - carimbo < JANELA_DE_REENVIO_MS;
}

/**
 * O INSTANTE EM QUE ESTE LINK CHEGOU ÀS MÃOS DO CANDIDATO, seja por qual porta for.
 *
 * `enviado_em` primeiro (a entrega por e-mail, quando o correio já aceitou), `criado_em` depois (a
 * entrega à mão, e também a janela entre emitir e carimbar). Ver o bloco de `JANELA_DE_REENVIO_MS`.
 */
export function instanteDaEntrega(linha: {
  enviadoEm?: Date | string | null;
  criadoEm?: Date | string | null;
}): Date | string | null {
  return linha.enviadoEm ?? linha.criadoEm ?? null;
}

/**
 * ESTE LINK FOI ENTREGUE HÁ POUCO? É a pergunta que a emissão do ENVIO faz antes de reemitir.
 *
 * Sem carimbo nenhum a resposta é NÃO, e na prática isso não acontece: `criado_em` tem valor
 * padrão no banco e toda linha o tem. A direção segura em caso de relógio torto continua sendo
 * ABSTER-SE (ver `enviadoHaPouco`), porque o preço de errar para o outro lado é matar um link que
 * acabou de ser entregue a alguém.
 */
export function entregueHaPouco(
  linha: { enviadoEm?: Date | string | null; criadoEm?: Date | string | null },
  agoraMs: number,
): boolean {
  return enviadoHaPouco(instanteDaEntrega(linha), agoraMs);
}

/** O prazo do link, em horas, como ele é escrito no e-mail. Espelha `PORTAL_LINK_TTL_HORAS`. */
export const PRAZO_DO_LINK_EM_HORAS = 72;

/** O que o candidato recebe. Assunto mais as duas representações do mesmo texto. */
export interface EmailDoLink {
  assunto: string;
  texto: string;
  html: string;
}

/** Os dados que o corpo aceita. Repare no que NÃO está aqui: CPF, nascimento e matrícula. */
export interface DadosDoEmailDoLink {
  nome: string;
  url: string;
  /** Instante de vencimento do link. Vira data e hora locais no corpo. */
  expiraEm: Date;
}

/** Só o primeiro nome no corpo do e-mail: o nome completo é dado a mais, sem ganho nenhum. */
function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes.length > 0 ? partes[0] : "";
}

/** Data e hora em português do Brasil, no fuso de São Paulo, que é onde o candidato está. */
function prazoLegivel(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(quando);
}

/** Escapa o que vai para dentro do HTML. Nome de pessoa é texto de terceiro, e texto de terceiro entra escapado. */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * O E-MAIL QUE LEVA O LINK, e ele carrega o MÍNIMO que faz a pessoa entender e agir.
 *
 * ┌─ O QUE ELE NÃO CONTÉM, E A AUSÊNCIA É A REGRA (§A.6, exigência da auditoria) ───────────────┐
 * │ SEM CPF, SEM DATA DE NASCIMENTO E SEM MATRÍCULA. Não é economia de texto: esses três são     │
 * │ exatamente o que a tela do portal PEDE para identificar a pessoa, então escrevê-los aqui     │
 * │ transformaria o e-mail em credencial completa. Caixa de e-mail é lida no celular emprestado, │
 * │ é encaminhada e sobrevive a troca de aparelho: o link sozinho não abre nada sem o que só o   │
 * │ candidato sabe, e é isso que o mantém seguro depois de entregue.                             │
 * │                                                                                               │
 * │ E SEM O NOME DO CLIENTE, pela mesma régua de minimização: quem recebe já sabe para onde está │
 * │ sendo admitido, e quem não devia receber passaria a saber.                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DIZ O PRAZO E PEDE PARA NÃO REPASSAR, as duas coisas exigidas pela auditoria. O prazo porque
 * link de 72 horas que vence em silêncio vira "o sistema não funciona"; o pedido de não repassar
 * porque a URL É a credencial de acesso ao prontuário, e o reflexo de quem não sabe disso é mandar
 * para o grupo da família pedindo ajuda para preencher.
 *
 * §A.11: sem travessão. §A.24: o assunto é TÍTULO, então vai em Title Case; o corpo é frase, e
 * frase segue a escrita normal.
 */
export function corpoDoEmailDoLink(dados: DadosDoEmailDoLink): EmailDoLink {
  const nome = primeiroNome(dados.nome);
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const prazo = prazoLegivel(dados.expiraEm);

  const assunto = "Envio Dos Seus Documentos De Admissão";

  const linhas = [
    saudacao,
    "",
    "Para seguir com a sua admissão, precisamos dos seus documentos. Use o endereço abaixo para enviá-los pelo celular ou pelo computador:",
    "",
    dados.url,
    "",
    `Este endereço vale por ${PRAZO_DO_LINK_EM_HORAS} horas e expira em ${prazo}.`,
    "",
    "O endereço é pessoal e dá acesso aos seus documentos. Não repasse para outras pessoas e não publique em grupos de mensagem. Se ele vencer, fale com o seu contato do RH e receba um novo.",
    "",
    "Se você não está em processo de admissão conosco, ignore esta mensagem.",
    "",
    "Equipe de Admissão, Grupo Soulan",
  ];

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2933">',
    `<p>${escaparHtml(saudacao)}</p>`,
    "<p>Para seguir com a sua admissão, precisamos dos seus documentos. Use o botão abaixo para enviá-los pelo celular ou pelo computador:</p>",
    `<p><a href="${escaparHtml(dados.url)}" style="display:inline-block;padding:12px 20px;background:#0f6f5c;color:#ffffff;text-decoration:none;border-radius:6px">Enviar Meus Documentos</a></p>`,
    `<p>Este endereço vale por ${PRAZO_DO_LINK_EM_HORAS} horas e expira em ${escaparHtml(prazo)}.</p>`,
    "<p>O endereço é pessoal e dá acesso aos seus documentos. Não repasse para outras pessoas e não publique em grupos de mensagem. Se ele vencer, fale com o seu contato do RH e receba um novo.</p>",
    "<p>Se você não está em processo de admissão conosco, ignore esta mensagem.</p>",
    "<p>Equipe de Admissão, Grupo Soulan</p>",
    "</div>",
  ].join("");

  return { assunto, texto: linhas.join("\n"), html };
}
