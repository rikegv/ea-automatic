/**
 * PORTAL, LIMITE DE RITMO POR IP DAS ROTAS ANÔNIMAS (veto 2 da auditoria do mapa de acesso público).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PARA RESOLVER, e ele é o furo V1 do desenho de segurança ─────────┐
 * │ O `ThrottlerGuard` global conta por `req.ip`, o backend escuta em `127.0.0.1` (`main.ts`) e   │
 * │ TODO mundo chega pelo proxy como o mesmo endereço. Exposto à internet, um laço contra         │
 * │ `portal/acesso-email/solicitar` consome os 120 por minuto do balde ÚNICO e o EA passa a       │
 * │ devolver 429 na cara dos consultores, sem o atacante nunca ter autenticado.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ╔═ A MEDIDA DA CADEIA (29/09/2026), E ELA MUDA O DESENHO ════════════════════════════════════╗
 * ║ Medido com o binário e o arquivo de configuração de produção (`caddy 2.11.4`,               ║
 * ║ `~/ea-proxy/Caddyfile`), reproduzidos em porta de teste:                                    ║
 * ║                                                                                             ║
 * ║  1. A `/api` NÃO PASSA PELO NEXT. O Caddy tem `handle /api/*` com `reverse_proxy             ║
 * ║     127.0.0.1:3011`: o Next só serve a UI. A cadeia do Portal em produção é                  ║
 * ║     candidato → Apache (.174) → Caddy :3010 → backend :3011, e não os três saltos supostos.  ║
 * ║  2. O CADDY SEM `trusted_proxies` SOBRESCREVE o `x-forwarded-for` com o IP do PEER, e        ║
 * ║     DESCARTA o que o cliente mandou (`X-Forwarded-For: 9.9.9.9` chegou como `127.0.0.1`).    ║
 * ║     Com o Apache na frente, o backend passa a ver SEMPRE o IP do Apache: o endereço do       ║
 * ║     candidato não chega, e nenhum limite por IP é possível.                                  ║
 * ║  3. COM `trusted_proxies static <IP do Apache>`, o Caddy PRESERVA a lista e ACRESCENTA o     ║
 * ║     peer à direita: chega `"<candidato>, <apache>"`. O elemento confiável é o ENÉSIMO A      ║
 * ║     PARTIR DA DIREITA, contando os saltos nossos; tudo o que estiver à esquerda dele é       ║
 * ║     forjável pelo visitante e NUNCA é lido aqui.                                             ║
 * ║  4. O `x-real-ip` do cliente ATRAVESSA o Caddy intacto. Ele é forjável e não é lido.         ║
 * ║  5. Pelo Next (homologação, :3120) o `x-forwarded-for` do cliente chega INTACTO e em         ║
 * ║     PRIMEIRO lugar (medido ponta a ponta: `203.0.113.77` gravado em `portal_eventos_ip`).    ║
 * ║     O proxy de rewrite do Next só escreve `x-forwarded-host`, e nunca o `for`.               ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * POR ISSO O IP CONFIÁVEL É CONFIGURAÇÃO, E ELE NASCE DESLIGADO (`PORTAL_RITMO_SALTOS_CONFIAVEIS`
 * ausente ou zero). Sem o número de saltos declarado, NADA é tratado como IP de cliente e o balde
 * por IP não roda: sobra o teto de superfície, que é o que contém o dano hoje. Ligar por omissão
 * seria confiar num cabeçalho que a medida 5 mostra ser forjável em pelo menos um dos caminhos.
 */

/** Só o que parece endereço vira chave de balde. Lixo não cria chave (mesma régua do `jtiSemVerificar`). */
const FORMATO_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const FORMATO_IPV6 = /^[0-9a-f:]{2,45}$/i;

/**
 * OS NÚMEROS, e cada um tem a conta do candidato real por trás.
 *
 * O que um candidato de verdade faz, somando o pior caso das cinco rotas anônimas: `identificar`
 * até 5 vezes (o teto de tentativas da decisão 5 é 5 por 15 minutos), `recuperacao` 1,
 * `acesso-email/solicitar` até 3 (o balde por e-mail é 3 por hora), `acesso-email/confirmar` até 5
 * (o código morre na quinta), `acesso-email/identidade` 1 ou 2. Dá menos de 20 requisições, e um
 * candidato apressado no celular não chega perto de 15 em 10 segundos.
 *
 * O laço automatizado, por outro lado, faz 60 em menos de um segundo. Entre 20 e 60 cabe a folga
 * inteira, e é por isso que o número generoso não custa nada: quem ele barra é sempre o laço.
 *
 * A FOLGA É PROPOSITAL POR CAUSA DO CGNAT. Candidato no 4G divide o IP público com MUITA gente, e
 * teto apertado por IP tranca o legítimo junto com o abusador. Com 60 por 5 minutos, três
 * candidatos teimosos atrás do mesmo NAT continuam passando.
 */
export const LIMITES_RITMO_PORTAL = {
  /** Rajada: nenhuma pessoa digita 15 vezes em 10 segundos. Corta o laço em menos de um segundo. */
  IP_RAJADA_LIMITE: 15,
  IP_RAJADA_JANELA_MS: 10_000,
  /** Sustentado: 60 por 5 minutos, três vezes o pior caso do candidato real. */
  IP_LIMITE: 60,
  IP_JANELA_MS: 5 * 60_000,
  /**
   * TETO DA SUPERFÍCIE ANÔNIMA INTEIRA, e o número é DE PROPÓSITO o mesmo 120 por minuto do balde
   * global de hoje: a superfície do Portal não ganha nem perde cota, ela só deixa de dividir a
   * cota com a operação interna. Nada é afrouxado (§A.26/§A.27).
   */
  SUPERFICIE_LIMITE: 120,
  SUPERFICIE_JANELA_MS: 60_000,
  /** Teto de LINHAS DE TRILHA do estouro, por regra. Log de recusa não pode virar amplificação. */
  TRILHA_LIMITE: 1,
  TRILHA_JANELA_MS: 60_000,
} as const;

/**
 * ╔═ O SEGUNDO PERFIL: AS SEIS ROTAS COM SESSÃO, E POR QUE ELAS PRECISAM DO MESMO FREIO ═══════╗
 * ║ VETO 5 da auditoria, e ele é o dano que o veto original descrevia, achado inteiro: as seis  ║
 * ║ rotas `@Public()` + `PortalSessaoGuard` (`credencial`, `confirmar`, `documentos`,            ║
 * ║ `dados-gi`, `termo`, `vt-link`) estão na allowlist da barreira e são alcançáveis SEM         ║
 * ║ credencial nenhuma. O `ThrottlerGuard` é o PRIMEIRO APP_GUARD (`app.module.ts`), então ele   ║
 * ║ CONTA ANTES de o guard de sessão recusar: um laço contra `POST portal/credencial` sem token  ║
 * ║ esgota o balde `default` e devolve 429 aos consultores, exatamente como pela porta anônima.  ║
 * ║ Fechar 5 de 11 portas não fechava o veto.                                                   ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * OS NÚMEROS SÃO OUTROS PORQUE O USO LEGÍTIMO É OUTRO, e eles saem da aritmética do próprio
 * domínio, não de estimativa: `LIMITES_PORTAL` permite **25 arquivos por link** e **10 emissões de
 * credencial por minuto**. O candidato que envia tudo faz, no pior minuto, 10 `credencial` + 10
 * `confirmar` + as atualizações de `documentos`, algo em torno de **30 por minuto**, e ao longo da
 * sessão inteira algo em torno de **80**. Os tetos daqui ficam ACIMA desse máximo que o domínio já
 * impõe, de propósito: quem morde o candidato legítimo tem de ser a régua de negócio, com a
 * mensagem certa, e nunca o limitador de volume, que fala "aguarde alguns minutos".
 *
 * O TETO DA SUPERFÍCIE COM SESSÃO É 240 POR MINUTO, e ele é o ÚNICO número desta frente que não
 * repete o 120 de hoje. A razão é aritmética, não conforto: a 30 por minuto por candidato, 120
 * cortaria o QUARTO candidato que estivesse enviando documento ao mesmo tempo, o que num disparo
 * de links em lote é o caso normal e não o excepcional. Nada da OPERAÇÃO INTERNA é afrouxado por
 * isso: o balde `default` continua com os mesmos 120 e deixa de ser dividido com estas rotas, que
 * é justamente o que o veto pedia.
 */
export const LIMITES_RITMO_SESSAO = {
  /** Rajada: o par `credencial` + `confirmar` de vários arquivos seguidos cabe folgado em 25. */
  IP_RAJADA_LIMITE: 25,
  IP_RAJADA_JANELA_MS: 10_000,
  /** Sustentado: 240 por 5 minutos, contra os ~150 do máximo que o domínio já deixa acontecer. */
  IP_LIMITE: 240,
  IP_JANELA_MS: 5 * 60_000,
  /** Superfície própria, separada da anônima: uma porta não gasta a cota da outra. */
  SUPERFICIE_LIMITE: 240,
  SUPERFICIE_JANELA_MS: 60_000,
  TRILHA_LIMITE: 1,
  TRILHA_JANELA_MS: 60_000,
} as const;

/** O formato comum dos dois perfis, para o guard não saber qual dos dois está servindo. */
export type PerfilDeRitmo = typeof LIMITES_RITMO_PORTAL | typeof LIMITES_RITMO_SESSAO;

/** Nomes dos baldes. Separados do `default` do throttler global: contagem nenhuma se mistura. */
export const BALDES_RITMO_PORTAL = {
  RAJADA: "portal-ritmo-rajada",
  SUSTENTADO: "portal-ritmo-ip",
  SUPERFICIE: "portal-ritmo-superficie",
  TRILHA: "portal-ritmo-trilha",
} as const;

/**
 * Os baldes do perfil COM SESSÃO, e eles são OUTROS nomes de propósito. Nome repetido não
 * misturaria só contagem: o `ThrottlerStorageService` limpa os temporizadores de TODAS as chaves do
 * mesmo NOME quando uma expira, então as duas portas se acelerariam uma à outra.
 */
export const BALDES_RITMO_SESSAO = {
  RAJADA: "portal-ritmo-sessao-rajada",
  SUSTENTADO: "portal-ritmo-sessao-ip",
  SUPERFICIE: "portal-ritmo-sessao-superficie",
  TRILHA: "portal-ritmo-sessao-trilha",
} as const;

/** As regras, como vão para a trilha (`regra`, campo já permitido em `portal-evento.ts`). */
export type RegraDeRitmo = "RITMO_IP" | "RITMO_SUPERFICIE";

/**
 * NÃO EXISTE MENSAGEM PRÓPRIA DO RITMO, E A AUSÊNCIA É A DEFESA.
 *
 * O 429 deste limitador usa o MESMO corpo do teto que já existe na identificação: código
 * `BLOQUEADO` e a frase `PORTAL_IDENTIFICACAO_BLOQUEADA`. Frase nova, ou código novo, seria ele
 * próprio um oráculo: quem estourasse saberia que estourou ESTE balde e não aquele, e a tela
 * passaria a distinguir dois "espere um pouco" que o candidato vive igual.
 *
 * E há uma segunda razão, medida: `CODIGOS_ERRO_IDENTIFICACAO` (shared-types) é uma lista FECHADA
 * de três, e a tela do candidato DESCARTA o que não estiver nela (`erroDaIdentificacao`,
 * `portal/page.tsx:290`). Um código novo cairia no ramo genérico e o candidato limitado leria
 * "portal indisponível" em vez de "aguarde alguns minutos". Reusar o código existente entrega a
 * mensagem certa SEM tocar o vocabulário compartilhado, que é do coordenador (§A.39).
 */
export const PORTAL_RITMO_CODIGO = "BLOQUEADO";

function normalizarIp(bruto: string): string | null {
  const limpo = bruto
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^::ffff:/i, "");
  // "1.2.3.4:5678" acontece quando a borda escreve host:porta. A porta não é identidade.
  const semPorta = FORMATO_IPV4.test(limpo.split(":")[0]) ? limpo.split(":")[0] : limpo;
  if (!FORMATO_IPV4.test(semPorta) && !FORMATO_IPV6.test(semPorta)) return null;
  return semPorta.slice(0, 45);
}

/**
 * POR QUE A DERIVAÇÃO DEVOLVE UM MOTIVO, E NÃO SÓ O IP (veto 2 da auditoria).
 *
 * Sem o motivo, "configurei e não funciona" é indistinguível de "configurei e funciona": o balde
 * por IP simplesmente não roda, ninguém conta, ninguém registra, e quem configurou acredita que
 * fechou o veto. O motivo é rótulo TÉCNICO fechado, sem endereço nenhum dentro (§A.6).
 */
export const MOTIVOS_SEM_IP = [
  /** A variável não foi declarada. É o estado de nascença, e NÃO é defeito. */
  "DESLIGADO",
  /** Declarada, e a barreira não escreveu cabeçalho nenhum. Quase sempre é a porta errada. */
  "SEM_CABECALHO",
  /** A cadeia tem menos saltos do que a configuração afirma: off-by-one, ou proxy a menos. */
  "CADEIA_CURTA",
  /** O elemento mais à direita NÃO é um proxy nosso: topologia diferente da declarada. */
  "ANCORA_NAO_BATE",
  /** A allowlist de proxy não foi declarada. Sem âncora, nada é confiável. */
  "SEM_ANCORA",
  /** O segredo da borda foi exigido e não veio, ou veio errado. */
  "SEGREDO_AUSENTE",
  /** O elemento lido não se parece com endereço nenhum. */
  "VALOR_INVALIDO",
] as const;
export type MotivoSemIp = (typeof MOTIVOS_SEM_IP)[number];

export interface OrigemDaRequisicao {
  /** O IP do candidato, ou `null`. `null` NUNCA vira balde: a porta cai para o teto da superfície. */
  ip: string | null;
  motivo: MotivoSemIp | null;
}

export interface TopologiaDaBorda {
  /** Quantos proxies NOSSOS existem entre o candidato e o backend. Zero desliga a derivação. */
  saltos: number;
  /** Os IPs que PODEM aparecer como o proxy mais à direita. Vazio desliga a derivação. */
  proxiesEsperados: readonly string[];
  /** Segredo opcional da borda. Declarado, ele passa a ser OBRIGATÓRIO (fail-closed). */
  segredoEsperado?: string | null;
  /** O segredo que veio na requisição, quando houver. */
  segredoRecebido?: string | null;
}

/**
 * O IP DO CANDIDATO, CONTADO DA DIREITA PARA A ESQUERDA E ANCORADO NA TOPOLOGIA DECLARADA.
 *
 * ╔═ POR QUE A ÂNCORA EXISTE (veto 1 da auditoria, três desvios PROVADOS executando a função) ══╗
 * ║ Contar o enésimo da direita SEM conferir quem escreveu o elemento mais à direita falha de   ║
 * ║ três jeitos, e os três entregam um IP ERRADO em vez de nenhum:                              ║
 * ║                                                                                             ║
 * ║  1. SALTOS SOBRE-DECLARADO (2 quando só o Caddy está na frente): o elemento lido passa a    ║
 * ║     ser o que o CLIENTE escreveu, e o atacante escolhe em qual balde cair. Pior do que não  ║
 * ║     limitar: ele ENVENENA o balde de um terceiro, e barra a vítima.                         ║
 * ║  2. SALTOS SUB-DECLARADO (1 com o Apache na frente): todo mundo colapsa no balde do Apache, ║
 * ║     e o primeiro laço barra todos os candidatos de uma vez.                                 ║
 * ║  3. A BARREIRA APONTADA PARA A PORTA DO NEXT em vez da do Caddy (que é o molde do pacote do ║
 * ║     VT, então é o erro provável): o Next repassa o `x-forwarded-for` do cliente INTACTO, e  ║
 * ║     a lista inteira vira escolha do visitante.                                              ║
 * ║                                                                                             ║
 * ║ A ÂNCORA FECHA OS DOIS PRIMEIROS INTEIROS: off-by-one nos dois sentidos passa a devolver    ║
 * ║ `null`, porque o elemento mais à direita deixa de bater com a allowlist. E FECHA O TERCEIRO ║
 * ║ SÓ EM PARTE, e isto está escrito aqui em vez de omitido: pelo Next, o visitante controla a  ║
 * ║ lista toda e pode terminá-la com o IP do proxy esperado. O que fecha o terceiro de verdade  ║
 * ║ é o SEGREDO DA BORDA abaixo, que é o item F1 do desenho; sem ele, o que resta é a disciplina║
 * ║ de a barreira apontar para a porta certa, e é por isso que a conferência do peer loopback   ║
 * ║ NÃO ajuda aqui: pelas duas portas o peer é `127.0.0.1` do mesmo jeito.                      ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * FALHA FECHADO em todos os desvios. Nenhum deles devolve "um IP qualquer": devolvem `null` e o
 * motivo, e quem chama trata como "não há IP de cliente". Chutar seria pior do que não ter nenhum,
 * porque criaria bloqueio contra terceiro.
 */
export function origemDaRequisicao(
  cabecalho: string | string[] | undefined,
  topologia: TopologiaDaBorda,
): OrigemDaRequisicao {
  const { saltos, proxiesEsperados } = topologia;
  if (!Number.isInteger(saltos) || saltos < 1) return { ip: null, motivo: "DESLIGADO" };
  if (proxiesEsperados.length === 0) return { ip: null, motivo: "SEM_ANCORA" };

  // O SEGREDO, QUANDO DECLARADO, É OBRIGATÓRIO. Declarar e não conferir seria pior que não ter.
  const segredoEsperado = (topologia.segredoEsperado ?? "").trim();
  if (segredoEsperado.length > 0) {
    if ((topologia.segredoRecebido ?? "").trim() !== segredoEsperado) {
      return { ip: null, motivo: "SEGREDO_AUSENTE" };
    }
  }

  const bruto = Array.isArray(cabecalho) ? cabecalho.join(",") : (cabecalho ?? "");
  const lista = bruto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (lista.length === 0) return { ip: null, motivo: "SEM_CABECALHO" };
  if (lista.length < saltos) return { ip: null, motivo: "CADEIA_CURTA" };

  // A ÂNCORA: o elemento mais à DIREITA foi escrito pelo nosso proxy, e tem de ser um deles.
  const ancora = normalizarIp(lista[lista.length - 1] ?? "");
  const esperados = proxiesEsperados.map((p) => normalizarIp(p) ?? p.trim());
  if (!ancora || !esperados.includes(ancora)) return { ip: null, motivo: "ANCORA_NAO_BATE" };

  const ip = normalizarIp(lista[lista.length - saltos] ?? "");
  if (!ip) return { ip: null, motivo: "VALOR_INVALIDO" };
  return { ip, motivo: null };
}

/** Atalho de leitura. Mantido porque quase todo chamador só quer o endereço. */
export function ipConfiavelDaBorda(
  cabecalho: string | string[] | undefined,
  topologia: TopologiaDaBorda,
): string | null {
  return origemDaRequisicao(cabecalho, topologia).ip;
}

/** A allowlist de proxy, como ela vem da configuração: CSV, vazia = derivação desligada. */
export function proxiesEsperadosDaConfiguracao(valor: string | undefined | null): string[] {
  return (valor ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Lê o número de saltos da configuração. Ausente, vazio ou inválido vale ZERO (desligado). */
export function saltosConfiaveisDaConfiguracao(valor: string | undefined | null): number {
  const n = Number.parseInt((valor ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
