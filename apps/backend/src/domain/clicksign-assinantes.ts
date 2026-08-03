/**
 * QUEM JÁ ASSINOU E QUEM ESTÁ DEVENDO (gerenciador de assinatura). Lógica PURA, sem rede.
 *
 * POR QUE PRECISA DE DUAS FONTES. Levantamento feito contra a API de produção da Clicksign
 * (03/08/2026), porque a suposição natural estava errada:
 *
 *  - `GET /envelopes/{id}/signers` devolve os assinantes (nome, `group`, `refusable`) e **NÃO tem
 *    campo de assinatura**: nada de `signed`, `signed_at` ou `status` por pessoa. Um envelope com um
 *    assinante que já assinou e outro que não é indistinguível pela lista de assinantes.
 *  - `GET /envelopes/{id}/requirements` também não tem: só `action`, `role` e `auth`, sem estado de
 *    cumprimento.
 *  - `GET /envelopes/{id}/events` TEM: cada assinatura gera um evento `sign` carregando
 *    `data.signer.key` (o mesmo id que a lista de assinantes devolve) e o instante em `created`.
 *
 * Então o status por pessoa existe, mas não vem pronto: nasce do CRUZAMENTO das duas listas. Conferido
 * nos dois envelopes reais da conta: no assinado, dois eventos `sign` com as chaves exatas dos dois
 * assinantes; no que está aguardando, zero eventos `sign`.
 *
 * §A.6, o requisito duro desta peça: o evento `sign` carrega e-mail, CPF, IP e coordenadas de quem
 * assinou. NADA disso sai daqui. O que atravessa é nome, se assinou, quando e a ordem, que é o que o
 * consultor precisa para cobrar quem está devendo.
 */

/** Assinante como a Clicksign devolve em `/signers` (só o que interessa; o resto é ignorado). */
export interface SignerBruto {
  id: string;
  nome: string;
  /** Ordem de assinatura. Grupo maior só é notificado depois que o anterior assina. */
  grupo?: number | null;
}

/** Evento de assinatura já reduzido ao par (chave do assinante, instante). */
export interface EventoAssinatura {
  signerKey: string;
  em: string;
}

/** Uma pessoa do envelope, como a tela mostra. Sem e-mail, sem CPF, sem IP (§A.6). */
export interface AssinanteStatus {
  nome: string;
  assinou: boolean;
  /** ISO de quando assinou; null em quem ainda não assinou. */
  assinadoEm: string | null;
  /** Ordem de assinatura (o `group` da Clicksign). Null quando o envelope não usa ordem. */
  ordem: number | null;
}

/**
 * Cruza assinantes e eventos. O casamento é pela CHAVE do assinante, nunca pelo nome: nome se repete,
 * muda de caixa e é editado, e um envelope pode ter homônimos.
 *
 * Ordenação: quem ainda deve aparece PRIMEIRO, porque a tela existe para cobrar. Dentro de cada
 * grupo, a ordem de assinatura da Clicksign; empate resolve por nome, para a lista não dançar entre
 * dois carregamentos.
 */
export function montarAssinantes(
  signers: SignerBruto[],
  eventos: EventoAssinatura[],
): AssinanteStatus[] {
  // Um assinante pode ter mais de um evento (reassinatura); vale o PRIMEIRO, que é quando assinou.
  const quando = new Map<string, string>();
  for (const e of eventos) {
    if (!e.signerKey) continue;
    const atual = quando.get(e.signerKey);
    if (atual === undefined || e.em < atual) quando.set(e.signerKey, e.em);
  }

  return signers
    .map((s) => {
      const em = quando.get(s.id) ?? null;
      return {
        nome: s.nome,
        assinou: em !== null,
        assinadoEm: em,
        ordem: s.grupo ?? null,
      };
    })
    .sort((a, b) => {
      if (a.assinou !== b.assinou) return a.assinou ? 1 : -1;
      const oa = a.ordem ?? Number.MAX_SAFE_INTEGER;
      const ob = b.ordem ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}

/** Resumo "2 de 3 assinaram", para a tela dizer o tamanho do buraco sem contar na mão. */
export function resumoAssinaturas(assinantes: AssinanteStatus[]): {
  total: number;
  assinaram: number;
  pendentes: number;
} {
  const assinaram = assinantes.filter((a) => a.assinou).length;
  return { total: assinantes.length, assinaram, pendentes: assinantes.length - assinaram };
}
