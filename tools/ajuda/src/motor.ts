/**
 * ─ A CASCA DO PLAYWRIGHT: ABRE A TELA, RESOLVE O ALVO, DESENHA E DELEGA A DECISÃO ───────────────
 *
 * ┌─ ESTE ARQUIVO NÃO DECIDE NADA, E ISSO É O DESENHO ───────────────────────────────────────────┐
 * │ As duas regras duras (alvo perdido derruba; nenhuma imagem antes do gate) moram em              │
 * │ `apps/frontend/src/ajuda/captura.ts`, e a asserção de população em `.../lote.ts`, porque é lá     │
 * │ que existe runner de teste: `tools/` não está no `pnpm-workspace.yaml` e não roda no `pnpm test`, │
 * │ então um gate aqui dentro seria INAUDITÁVEL (§A.38 exige que quem testa não seja quem escreveu). │
 * │ Aqui ficam só as implementações que precisam de navegador, injetadas como dependência.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS TRÊS MODOS:
 *   `conferir`: não anota e não grava. Prova que os alvos existem e que a tela está limpa. É o
 *               detector de artigo velho para o CI.
 *   `ensaiar`:  anota e mede, sem gravar. É como o motor roda enquanto o veto do `seguranca` está de
 *               pé.
 *   `capturar`: grava, e só por `executarCaptura`, que é a peça testada.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  caminhoDoArquivoDePreparo,
  conferirListaPovoada,
  executarCaptura,
  OPCOES_NAVEGADOR_CAPTURA,
  PASTA_DOS_ARQUIVOS_DE_PREPARO,
  type Caixa,
  type DependenciasCaptura,
} from "../../../apps/frontend/src/ajuda/captura";
import {
  auditarTelaDoManual,
  descreverAchados,
  type AllowlistArnes,
  type NegadosDeEquipe,
  type VocabularioDoSistema,
} from "../../../apps/frontend/src/ajuda/pii";
import type { Alvo, Captura, GestoDePreparo, Roteiro } from "../../../apps/frontend/src/ajuda/tipos";
import {
  BASE_HOMOLOG,
  CAMINHO_PLAYWRIGHT,
  FalhaDeMotor,
  GRAVACAO_VETADA,
  MOTIVO_DO_VETO,
  exigirHomologacao,
  lerCredencialDeCaptura,
  raizDoRepositorio,
} from "./ambiente";
import { anotar, limparAnotacao, type AlvoMedido } from "./anotar";
import { contarLinhasDaArea, lerTextoAuditavel } from "./coleta";
import { descreverAlvo, localizar } from "./localizador";
import type { Caixa as CaixaDePixel, Chromium, Navegador, Pagina } from "./playwright-minimo";

export type ModoMotor = "conferir" | "ensaiar" | "capturar";

/**
 * CSS DE ESTABILIDADE. Sem ele, dois prints da MESMA tela saem diferentes (a aurora de fundo é
 * animada e desfocada) e o diff do git acusa mudança onde não houve. O print muda quando a TELA muda,
 * e só aí.
 */
const CSS_ESTAVEL = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  .aurora, .blob { display: none !important; }
  html { scroll-behavior: auto !important; }
`;

export async function abrirNavegador(): Promise<Chromium> {
  // `pathToFileURL`: import dinâmico de CAMINHO ABSOLUTO não é especificador válido de ESM,
  // e o erro que ele dá ("Invalid URL") não parece com o que é.
  const modulo = (await import(pathToFileURL(CAMINHO_PLAYWRIGHT).href)) as { chromium: Chromium };
  return modulo.chromium;
}

/**
 * Modais que bloqueiam clique. Com a conta MASTER eles não deveriam aparecer (é metade do motivo de
 * a conta ser MASTER e não super admin), mas a rotina fica: modal que renasce é defeito de ambiente
 * conhecido. Escape é a saída de teclado que a §A.41 preserva de propósito.
 */
export async function fecharModaisDeEntrada(page: Pagina): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const ciente = page.getByRole("button", { name: /Estou ciente/i }).first();
    if (await ciente.isVisible().catch(() => false)) {
      await ciente.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(400);
      continue;
    }
    const dialogo = page.getByRole("dialog").first();
    if (await dialogo.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      continue;
    }
    return;
  }
}

/**
 * LOGIN COM A CONTA MASTER DE CAPTURA. A senha entra em memória e sai daqui: qualquer erro é
 * reescrito, porque a mensagem da biblioteca pode citar o valor que tentou digitar, e isso seria a
 * credencial no log da fábrica (§A.6).
 */
export async function entrar(page: Pagina): Promise<string> {
  const { usuario, senha } = lerCredencialDeCaptura();
  await page.goto(exigirHomologacao("/login"), { waitUntil: "networkidle" });
  try {
    await page.locator('input[name="email"]').first().fill(usuario);
    await page.locator('input[name="password"]').first().fill(senha);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  } catch {
    throw new FalhaDeMotor(
      `Falha ao entrar na homologação como ${usuario} (detalhe omitido de propósito: a mensagem da ` +
        `biblioteca pode citar a credencial).`,
    );
  }
  await page.waitForTimeout(1500);
  /**
   * ─ CONTA PRESA EM TROCA DE SENHA: FALHA AQUI, COM O NOME CERTO ─────────────────────────────────
   *
   * ┌─ O DIAGNÓSTICO QUE ISTO CONSERTA, E ELE CUSTOU UMA RODADA INTEIRA ─────────────────────────┐
   * │ A conta de captura nasceu com SENHA TEMPORÁRIA. O sistema rebate toda navegação para          │
   * │ `/trocar-senha`, e a espera acima (`!pathname.includes("/login")`) é SATISFEITA por essa rota: │
   * │ o motor conclui que entrou. Daí em diante cada roteiro navega, é rebatido, e falha com         │
   * │ "ALVO NÃO ENCONTRADO", que é a mensagem do detector de ARTIGO VELHO. Os quatro roteiros        │
   * │ acusaram tela mudada quando o que havia era conta presa, e mandaram procurar defeito no        │
   * │ roteiro, que estava certo.                                                                     │
   * │                                                                                                │
   * │ A régua geral: quando a causa está no ARRANQUE, falhar no arranque é o que separa um           │
   * │ diagnóstico de dez passos de um de uma linha.                                                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O MOTOR NÃO TROCA A SENHA SOZINHO (§A.23, mesma régua de `lerCredencialDeCaptura`): criar conta
   * ou mexer em credencial de alguém não é decisão da fábrica. Ele para e diz o que fazer.
   */
  if (new URL(page.url()).pathname.startsWith("/trocar-senha")) {
    throw new FalhaDeMotor(
      `CONTA DE CAPTURA PRESA NA TROCA DE SENHA (${usuario}).\n` +
        `  O login funcionou, mas a senha é TEMPORÁRIA e o sistema rebate toda navegação para ` +
        `/trocar-senha. Nenhum roteiro alcança a tela dele, e a falha apareceria dez passos adiante ` +
        `como "alvo não encontrado", mandando procurar defeito no artigo, que está certo.\n` +
        `  Conserto: trocar a senha dessa conta pelo fluxo normal e atualizar o arquivo de ` +
        `credencial. O motor não troca senha de ninguém (§A.23).`,
    );
  }
  await fecharModaisDeEntrada(page);
  return usuario;
}

/** Tema CLARO, sempre (conserto 6): print de tema escuro fica ilegível impresso e em projeção. */
export async function prepararPagina(page: Pagina): Promise<void> {
  await page.addInitScript(
    `try{localStorage.setItem('ea-theme','light');}catch(e){}` +
      `document.documentElement.setAttribute('data-theme','light');`,
  );
}

/** Resolve a caixa do alvo: rola até ele, mede, e recusa o que caiu fora da viewport da captura. */
function fazerResolvedor(page: Pagina, roteiro: Roteiro): (alvo: Alvo) => Promise<Caixa | null> {
  const { width, height } = OPCOES_NAVEGADOR_CAPTURA.viewport;
  return async (alvo) => {
    const loc = localizar(page, alvo);
    if ((await loc.count().catch(() => 0)) === 0) return null;
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return null;
    const fora = box.y < 0 || box.x < 0 || box.y + box.height > height || box.x + box.width > width;
    if (fora) {
      throw new FalhaDeMotor(
        `ALVO FORA DA VIEWPORT depois da rolagem. Roteiro "${roteiro.slug}", alvo ` +
          `${descreverAlvo(alvo)}. A captura é de viewport (${width}x${height}) e o overlay é fixo: ` +
          `anotar fora dela sairia no lugar errado. Quebre o print em dois, ou role no preparo.`,
      );
    }
    return { x: box.x, y: box.y, largura: box.width, altura: box.height };
  };
}

async function desenhar(
  page: Pagina,
  roteiro: Roteiro,
  print: Captura,
  marcacoes: Array<{ alvo: Alvo; caixa: Caixa }>,
): Promise<Array<{ texto: string; lado: string; ajustado: boolean }>> {
  const medidos: AlvoMedido[] = marcacoes.map(({ alvo, caixa }) => ({
    texto: alvo.texto,
    forma: alvo.forma ?? "elipse",
    lado: alvo.lado,
    box: { x: caixa.x, y: caixa.y, width: caixa.largura, height: caixa.altura },
  }));
  const relatorio = await anotar(page, medidos);
  if (relatorio.naoResolvidos.length > 0) {
    await limparAnotacao(page);
    throw new FalhaDeMotor(
      `RÓTULO SEM LUGAR. Roteiro "${roteiro.slug}", print "${print.arquivo}": ` +
        `${relatorio.naoResolvidos.map((t) => `"${t}"`).join(", ")} escreveria por cima de outra ` +
        `anotação, e print com rótulo ilegível ensina errado. Reduza o rótulo, mude o lado, ou ` +
        `quebre o print em dois.`,
    );
  }
  return relatorio.colocados;
}

async function executarPreparo(
  page: Pagina,
  roteiro: Roteiro,
  gestos: GestoDePreparo[] | undefined,
  origem: string,
): Promise<void> {
  for (const gesto of gestos ?? []) {
    const loc = localizar(page, gesto.alvo);
    if ((await loc.count().catch(() => 0)) === 0) {
      throw new FalhaDeMotor(
        `PREPARO FALHOU (${origem}). Roteiro "${roteiro.slug}": o gesto "${gesto.acao}" não achou ` +
          `${descreverAlvo(gesto.alvo)} na rota ${roteiro.url}. A tela mudou.`,
      );
    }
    if (gesto.acao === "clicar" || gesto.acao === "abrirAba") await loc.click({ timeout: 8000 });
    else if (gesto.acao === "digitar") await loc.fill(gesto.valor ?? "", { timeout: 8000 });
    else if (gesto.acao === "subirArquivo") {
      /**
       * ─ `subirArquivo`, E O ARQUIVO É SINTÉTICO E VERSIONADO ────────────────────────────────────
       *
       * Só sobe o que está em `capturas/arquivos/`, e é `caminhoDoArquivoDePreparo` (peça TESTADA)
       * que recusa caminho absoluto e subida de diretório. A checagem de EXISTÊNCIA fica aqui porque
       * ela é do disco: arquivo declarado e ausente falharia dez passos adiante como "alvo não
       * encontrado", que é a mensagem do detector de artigo velho, e mandaria procurar defeito no
       * roteiro, que está certo (a mesma régua do arranque, ver `entrar`).
       */
      const relativo = caminhoDoArquivoDePreparo(gesto.valor, `roteiro "${roteiro.slug}", ${origem}`);
      const absoluto = path.join(raizDoRepositorio(), relativo);
      if (!fs.existsSync(absoluto)) {
        throw new FalhaDeMotor(
          `ARQUIVO DE PREPARO AUSENTE: ${relativo} (roteiro "${roteiro.slug}", ${origem}).\n` +
            `  O arquivo é SINTÉTICO e versionado junto do roteiro (§A.6): ele aparece na tela e a ` +
            `tela vira PNG no repositório. Crie-o em ${PASTA_DOS_ARQUIVOS_DE_PREPARO}.`,
        );
      }
      await loc.setInputFiles(absoluto, { timeout: 15000 });
      // A SUBIDA É ASSÍNCRONA DO LADO DA TELA: a prévia da importação chama o backend e a IA lê o
      // cabeçalho. Fotografar no instante do `setInputFiles` pegaria a tela ANTES da prévia, que é
      // exatamente o estado que este gesto existe para superar.
      await page.waitForTimeout(6000);
    } else await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
    await page.waitForTimeout(600);
  }
}

export type ResultadoRoteiro = {
  slug: string;
  modo: ModoMotor;
  arquivos: string[];
  rotulos: Array<{ print: string; texto: string; lado: string; ajustado: boolean }>;
};

export async function executarRoteiro(
  page: Pagina,
  roteiro: Roteiro,
  modo: ModoMotor,
  allowlist: AllowlistArnes,
  /**
   * NOME E E-MAIL DOS USUÁRIOS REAIS DA HOMOLOGAÇÃO, que o gate PROCURA em cada tela. Vem da
   * asserção de arranque (`conferirBaseAntesDoLote`), que os lê da tabela `usuarios`: eles
   * PERMANECEM na base (são o time testando) e por isso a proteção é por imagem, não por população.
   *
   * **OBRIGATÓRIO**, e sem valor padrão (segundo veto do `seguranca`): enquanto era opcional, o
   * caminho que grava podia deixar de passá-lo sem que typecheck nem teste acusassem nada, e o gate
   * voltava a ser o de antes em silêncio. Quem chama declara, inclusive para declarar lista vazia.
   */
  negados: NegadosDeEquipe,
  /**
   * O VOCABULÁRIO DO SISTEMA QUE NÃO É PESSOA (cidade, cliente, loja, cargo), lido do banco e JÁ
   * subtraído da denylist. Opcional porque a ausência dele é o lado ESTRITO: sem ele o gate volta a
   * recusar a loja e a cidade, que é falso positivo, nunca vazamento.
   */
  vocabulario?: VocabularioDoSistema,
): Promise<ResultadoRoteiro> {
  if (modo === "capturar" && GRAVACAO_VETADA) {
    throw new FalhaDeMotor(`GRAVAÇÃO BLOQUEADA: ${MOTIVO_DO_VETO}`);
  }
  /**
   * ─ O ESTADO DO ROTEIRO, e por que ele é RECONSTRUÍDO em vez de herdado ────────────────────────
   *
   * ┌─ CADA IMAGEM TEM DE SER CAPTURÁVEL SOZINHA ───────────────────────────────────────────────┐
   * │ Imagem que depende do estado deixado pela anterior faz o primeiro ajuste numa delas         │
   * │ derrubar todas as seguintes, e com 400 imagens isso é uma frente inteira perdida. Pior:      │
   * │ falha por estado herdado CHEGA COMO "alvo não encontrado", que é a mensagem do detector de   │
   * │ artigo velho, e manda alguém procurar defeito no artigo que está certo.                     │
   * │                                                                                             │
   * │ A régua é acumulativa e determinística: o preparo do ROTEIRO roda primeiro e vale para todas │
   * │ as imagens; o da IMAGEM roda depois e só para ela. Antes de cada imagem que declara preparo, │
   * │ e também depois de qualquer imagem que tenha declarado (o estado ficou sujo), o motor VOLTA  │
   * │ ao estado do roteiro: recarrega a rota e reaplica `roteiro.preparo`.                         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const irParaOEstadoDoRoteiro = async () => {
    await page.goto(exigirHomologacao(roteiro.url), { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await fecharModaisDeEntrada(page);
    await page.addStyleTag({ content: CSS_ESTAVEL });
    await executarPreparo(page, roteiro, roteiro.preparo, "preparo do roteiro");
    await page.waitForTimeout(400);
  };
  await irParaOEstadoDoRoteiro();

  const resolverAlvo = fazerResolvedor(page, roteiro);
  const arquivos: string[] = [];
  const rotulos: ResultadoRoteiro["rotulos"] = [];
  let estadoSujo = false;

  for (const print of roteiro.capturas) {
    const temPreparoProprio = (print.preparo?.length ?? 0) > 0;
    if (temPreparoProprio || estadoSujo) {
      await irParaOEstadoDoRoteiro();
      estadoSujo = false;
    }
    if (temPreparoProprio) {
      await executarPreparo(page, roteiro, print.preparo, `preparo do print "${print.arquivo}"`);
      await page.waitForTimeout(400);
      estadoSujo = true;
    }

    // O RECORTE é resolvido UMA VEZ e serve às duas coisas: o gate audita esta caixa e a imagem é
    // esta caixa. Auditar uma região e fotografar outra seria o pior dos dois mundos.
    let recorte: CaixaDePixel | undefined;
    if (print.recorte) {
      const caixa = await resolverAlvo(print.recorte);
      if (!caixa) {
        throw new FalhaDeMotor(
          `RECORTE NÃO ENCONTRADO. Roteiro "${roteiro.slug}", print "${print.arquivo}", ` +
            `${descreverAlvo(print.recorte)}. Esta tela só pode virar imagem RECORTADA (§A.6), ` +
            `então sem a caixa não há captura: fotografar a tela inteira é justamente o que o ` +
            `recorte existe para impedir.`,
        );
      }
      recorte = { x: caixa.x, y: caixa.y, width: caixa.largura, height: caixa.altura };
    }

    if (modo === "capturar") {
      // A DECISÃO É DA PEÇA TESTADA. A casca só entrega as implementações de navegador.
      const deps: DependenciasCaptura = {
        allowlist,
        negados,
        vocabulario,
        resolverAlvo,
        lerTextoDaTela: () => lerTextoAuditavel(page, print.recorte),
        // A MESMA CAIXA DO RECORTE alimenta as três coisas: o gate audita, a contagem de linhas mede e
        // a imagem fotografa. Quem recusa a lista vazia é a peça testada, nunca esta casca.
        contarLinhasDaArea: () => contarLinhasDaArea(page, print.recorte),
        anotar: async (marcacoes) => {
          rotulos.push(
            ...(await desenhar(page, roteiro, print, marcacoes)).map((c) => ({
              print: print.arquivo,
              ...c,
            })),
          );
        },
        capturarPng: () => page.screenshot(recorte ? { clip: recorte } : undefined),
        gravar: async (caminho, imagem) => {
          const destino = path.join(raizDoRepositorio(), caminho);
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          fs.writeFileSync(destino, imagem);
          arquivos.push(destino);
        },
      };
      await executarCaptura(roteiro.slug, print, deps);
      await limparAnotacao(page);
      continue;
    }

    // `conferir` e `ensaiar`: as MESMAS TRÊS regras do caminho que grava (alvo existe, a lista tem
    // linha, a tela passa no gate), sem nunca chegar a existir imagem. A terceira entrou com o
    // `LISTA_VAZIA`: sem ela aqui, o `conferir` daria VERDE no print de fila vazia e só o `capturar`
    // recusaria, ou seja, o erro apareceria na hora errada, e `conferir` existe para antecipá-lo.
    const marcacoes: Array<{ alvo: Alvo; caixa: Caixa }> = [];
    for (const alvo of print.alvos) {
      const caixa = await resolverAlvo(alvo);
      if (!caixa) {
        throw new FalhaDeMotor(
          `ALVO NÃO ENCONTRADO. Roteiro "${roteiro.slug}", print "${print.arquivo}", alvo ` +
            `${descreverAlvo(alvo)} (rótulo "${alvo.texto}") na rota ${roteiro.url}.\n` +
            `  A tela mudou e o artigo ficou velho: corrija o roteiro e o texto na MESMA entrega ` +
            `(§A.43). O motor não grava print sem a marcação.`,
        );
      }
      marcacoes.push({ alvo, caixa });
    }
    // AS MESMAS REGRAS DO CAMINHO QUE GRAVA, e a da lista vazia entra aqui também: é justamente em
    // `conferir` (o detector de artigo velho, que roda no CI) que a fila esvaziada tem de aparecer.
    const textoDaTela = await lerTextoAuditavel(page, print.recorte);
    conferirListaPovoada(
      roteiro.slug,
      print,
      textoDaTela,
      await contarLinhasDaArea(page, print.recorte),
    );
    const veredicto = auditarTelaDoManual(textoDaTela, allowlist, negados, vocabulario);
    if (!veredicto.aprovado) {
      throw new FalhaDeMotor(
        `TELA REPROVADA PELO GATE DE DADO PESSOAL. Roteiro "${roteiro.slug}", print ` +
          `"${print.arquivo}", rota ${roteiro.url}. ${veredicto.achados.length} achado(s):\n` +
          `${descreverAchados(veredicto.achados.slice(0, 15))}` +
          `${veredicto.achados.length > 15 ? `\n  ... e mais ${veredicto.achados.length - 15}.` : ""}\n` +
          `  Nada foi gravado (o modo é "${modo}"). Print entra no git e git guarda para sempre (§A.6).`,
      );
    }
    if (modo === "ensaiar") {
      rotulos.push(
        ...(await desenhar(page, roteiro, print, marcacoes)).map((c) => ({
          print: print.arquivo,
          ...c,
        })),
      );
      await limparAnotacao(page);
    }
  }
  return { slug: roteiro.slug, modo, arquivos, rotulos };
}

/**
 * Abre o navegador já logado. As opções vêm da CONSTANTE conferida em teste: sem trace, sem vídeo,
 * sem HAR, com 1600x1000, escala 2 e tema claro.
 */
export async function abrirSessao(): Promise<{ navegador: Navegador; page: Pagina; usuario: string }> {
  const chromium = await abrirNavegador();
  const navegador = await chromium.launch({ args: ["--no-sandbox"] });
  const contexto = await navegador.newContext({ ...OPCOES_NAVEGADOR_CAPTURA });
  const page = await contexto.newPage();
  await prepararPagina(page);
  const usuario = await entrar(page);
  return { navegador, page, usuario };
}

/**
 * ─ A PÁGINA SEM SESSÃO, PARA AS TELAS QUE EXISTEM PARA QUEM AINDA NÃO ENTROU ───────────────────
 *
 * ┌─ POR QUE UM CONTEXTO NOVO, E NÃO UM "SAIR" NA PÁGINA QUE JÁ EXISTE ─────────────────────────┐
 * │ Deslogar a página do lote a derrubaria para todos os roteiros seguintes, e o lote voltaria a     │
 * │ logar no meio, que é estado herdado, o defeito que o motor evita em toda parte. Contexto novo é  │
 * │ isolado por construção: cookie nenhum, storage nenhum, e o roteiro interno seguinte continua     │
 * │ logado na página dele.                                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `entrar` NÃO É CHAMADO AQUI, e é esse o ponto inteiro: o motor abre a tela de login e a fotografa
 * VAZIA. Ele nunca digita usuário nem senha numa tela que vai virar imagem (§A.6). O campo de senha
 * já é descartado pelo texto auditado, mas não digitar é a barreira anterior, e é de graça.
 */
export async function abrirPaginaSemSessao(navegador: Navegador): Promise<Pagina> {
  const contexto = await navegador.newContext({ ...OPCOES_NAVEGADOR_CAPTURA });
  const page = await contexto.newPage();
  await prepararPagina(page);
  return page;
}

export { BASE_HOMOLOG, FalhaDeMotor };
