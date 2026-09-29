/**
 * ─ QUEM ENSINA ESTA ROTA, E A DERIVAÇÃO DAS ROTAS DO SISTEMA ───────────────────────────────────
 *
 * Duas funções puras que DOIS lados precisam, e é por isso que elas saíram de onde estavam:
 *
 *   `artigosDaRotaEm`  — estava dentro de `registro.ts`, fechada sobre o barril gerado. O detector
 *                        de controle órfão precisa da MESMA resolução, mas sobre uma lista de
 *                        artigos injetada (é assim que ele fica testável). Duas cópias da regra de
 *                        prefixo divergiriam, e o sintoma seria o detector medindo uma tela contra
 *                        um artigo que o painel da tela não mostra.
 *   `rotasDeArquivosDePagina` — a lista de telas do sistema, derivada dos arquivos de página. Ela é
 *                        pura de propósito: quem varre o disco é a casca, quem decide o que é rota
 *                        é aqui, onde há runner de teste.
 */
import type { Artigo } from "./tipos";

/** Tira a barra final, preservando a raiz. Uma régua só para os dois lados da comparação. */
export function normalizarRota(rota: string): string {
  return rota.replace(/\/+$/, "") || "/";
}

/**
 * QUEM ENSINA ESTA ROTA. Uma tela pode ter vários artigos (a esteira tem muitos), então isto devolve
 * LISTA: o painel mostra as opções e a pessoa escolhe. Adivinhar errado é pior do que listar.
 *
 * Casa a rota exata primeiro e só depois por prefixo, para uma tela com endereço filho não herdar o
 * artigo do pai quando ela tem o seu próprio.
 */
export function artigosDaRotaEm(artigos: Artigo[], rota: string): Artigo[] {
  const limpa = normalizarRota(rota);
  const exatos = artigos.filter((a) => a.rotas.some((r) => normalizarRota(r) === limpa));
  if (exatos.length > 0) return exatos;
  return artigos.filter((a) =>
    a.rotas.some((r) => {
      const base = normalizarRota(r);
      return base !== "/" && (limpa === base || limpa.startsWith(`${base}/`));
    }),
  );
}

/**
 * ─ AS TELAS QUE O DETECTOR NÃO VISITA, E CADA UMA COM O MOTIVO ESCRITO ─────────────────────────
 *
 * A lista é CURTA e DECLARADA, porque toda tela que sai daqui sai da conta da cobertura: uma lista
 * generosa é a forma silenciosa de o número ficar bonito. O que está fora está fora por motivo
 * técnico de ENUMERAÇÃO, nunca por ser trabalhoso de documentar.
 */
export const ROTAS_FORA_DA_ENUMERACAO: Array<{ rota: string; motivo: string }> = [
  {
    rota: "/login",
    motivo: "a enumeração roda LOGADA; visitar o login derruba a sessão do resto do lote",
  },
  {
    rota: "/trocar-senha",
    motivo: "mexe na credencial da conta de captura, e a fábrica não troca senha de ninguém (§A.23)",
  },
  {
    rota: "/portal",
    motivo:
      "tela do candidato, entrada por CPF; logado ela só mostra o formulário de CPF, e tentar " +
      "passar dele tranca o CPF por 15 minutos",
  },
  {
    rota: "/vt",
    motivo: "exige link assinado, e a homologação não tem a chave (devolve 503); só se mede em produção",
  },
  { rota: "/kit", motivo: "fora do menu de propósito (§A.15) e fora do inventário do manual" },
  { rota: "/ajuda", motivo: "é a própria Central De Ajuda: ela não se documenta a si mesma" },
];

/**
 * ─ AS ROTAS PÚBLICAS, E POR QUE O MOTOR PRECISA SABER DISSO ────────────────────────────────────
 *
 * ┌─ O PROBLEMA: O ARTIGO "ENTRAR NO SISTEMA" NÃO TINHA COMO TER PRINT ─────────────────────────┐
 * │ O motor ENTRA antes de abrir o roteiro, e o sistema rebate quem já tem sessão para fora do      │
 * │ login. Um roteiro apontado para `/login` fotografaria o painel inicial, e o artigo que ensina a  │
 * │ entrar ilustraria a tela de depois de entrar. Pior: falharia como "alvo não encontrado", que é a │
 * │ mensagem do detector de artigo velho, mandando procurar defeito num roteiro que está certo.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A SAÍDA É **DERIVAR DA ROTA**, E NÃO DECLARAR NO ROTEIRO, e essa é a parte da decisão que importa.
 * Um campo `sessao: "SEM_SESSAO"` no `Roteiro` parece mais explícito e é PIOR por duas razões: mexe no
 * contrato (que tem dono único, §A.39) e, sobretudo, permite declarar "sem sessão" para uma tela
 * INTERNA. Aí o motor abriria o sistema deslogado, seria rebatido para o login e fotografaria o
 * login, que é o mesmo defeito ao contrário. Derivando da rota, isso é impossível de escrever.
 *
 * A LISTA É CURTA, FECHADA E COM MOTIVO, como a de cima. Rota pública é a que existe PARA quem não
 * tem sessão; toda outra é interna por definição.
 */
export const ROTAS_PUBLICAS: Array<{ rota: string; motivo: string }> = [
  { rota: "/login", motivo: "a porta de entrada: ela só existe para quem ainda não entrou" },
  {
    rota: "/trocar-senha",
    motivo:
      "a troca de senha temporária acontece antes de o sistema liberar qualquer tela, e o motor " +
      "NUNCA digita senha nela (§A.6, §A.23): ele só fotografa",
  },
  { rota: "/portal", motivo: "tela do candidato, que entra por CPF e não tem usuário do sistema" },
  { rota: "/vt", motivo: "formulário de vale-transporte do candidato, alcançado por link assinado" },
];

/**
 * A rota é pública? Casa por prefixo, para uma etapa filha do portal herdar o regime do portal.
 *
 * FAIL-CLOSED PARA O LADO QUE IMPORTA: em dúvida, a rota é INTERNA e o motor entra antes. Tratar uma
 * tela interna como pública produziria print do login; o contrário produz uma falha clara.
 */
export function ehRotaPublica(url: string): boolean {
  const limpa = normalizarRota(url);
  return ROTAS_PUBLICAS.some(
    (p) => limpa === p.rota || limpa.startsWith(`${p.rota}/`) || limpa.startsWith(`${p.rota}?`),
  );
}

/**
 * AS ROTAS DO SISTEMA, a partir dos caminhos dos arquivos de página.
 *
 * Tira os grupos de rota do Next (`(app)`, que não aparecem na URL), tira o `/page.tsx` e DESCARTA
 * rota com segmento dinâmico (`[slug]`): enumerar `/ajuda/[slug]` exigiria inventar um valor, e o
 * valor inventado é o que faz o detector medir uma tela que ninguém abre.
 *
 * `caminhos` são relativos à pasta de páginas, com ou sem barra inicial.
 */
export function rotasDeArquivosDePagina(caminhos: string[]): string[] {
  const rotas = new Set<string>();
  for (const bruto of caminhos) {
    const semArquivo = bruto.replace(/\/?page\.tsx$/, "");
    const segmentos = semArquivo
      .split("/")
      .filter(Boolean)
      // Grupo de rota do Next: organiza o disco e NÃO entra na URL.
      .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    if (segmentos.some((s) => s.includes("[") || s.includes("]"))) continue;
    rotas.add(`/${segmentos.join("/")}`.replace(/\/+$/, "") || "/");
  }
  const fora = new Set(ROTAS_FORA_DA_ENUMERACAO.map((f) => f.rota));
  return [...rotas].filter((r) => !fora.has(r)).sort();
}
