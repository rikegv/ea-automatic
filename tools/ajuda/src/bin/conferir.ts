/**
 * ─ `ajuda:conferir`: O DETECTOR DE ARTIGO VELHO, PARA O CI ─────────────────────────────────────
 *
 * Roda os roteiros SEM GRAVAR NADA e responde uma pergunta só: os alvos que os prints marcam ainda
 * existem na tela? Some um botão, e este comando falha com o slug, o print e o alvo, o que traduz
 * "a tela mudou" em "o manual ficou velho" ANTES de alguém ler um passo que não existe mais.
 *
 * ELE TAMBÉM RODA O GATE DE PII e a ASSERÇÃO DE POPULAÇÃO, mesmo sem gravar imagem: custa quase nada
 * e acusa cedo a homologação que voltou a ter gente real, que é justamente o estado em que a próxima
 * captura viraria vazamento permanente.
 *
 * SAÍDA DIFERENTE DE ZERO É O PONTO. Aviso que ninguém lê é a diferença entre detecção e esperança.
 */
import { conferirBaseAntesDoLote } from "../../../../apps/frontend/src/ajuda/lote";
import { montarAllowlist } from "../allowlist";

import { garantirItemInativoDeExemplo } from "../arnes-catalogo";
import { abrirLeitorDaBase } from "../base-sintetica";
import { exigirDeclaracaoDoArnes } from "../declaracao";
import { abrirPaginaSemSessao, abrirSessao, executarRoteiro } from "../motor";
import { descreverProtecao, remontarProtecao } from "../protecao-por-roteiro";
import { ehRotaPublica } from "../../../../apps/frontend/src/ajuda/rotas";
import { carregarRoteiros } from "../roteiros";

/**
 * ─ PREPARAÇÃO DE DADO DO ARTIGO DE CATÁLOGO ────────────────────────────────────────────────────
 *
 * Roda SÓ quando o roteiro que precisa dela está na lista, e não a cada comando: `conferir` é o
 * detector de artigo velho e não deveria escrever no banco sem motivo. O arnês é idempotente e
 * mexe em UM item que é dele (ver `arnes-catalogo.ts`); item real de catálogo nunca é inativado.
 */
async function prepararDadoDosRoteiros(slugs: string[]): Promise<void> {
  if (!slugs.includes("manter-um-catalogo-do-sistema")) return;
  const efeito = await garantirItemInativoDeExemplo();
  console.log(
    `[ajuda] arnês do catálogo: item de exemplo INATIVO ${
      efeito === "ja-estava" ? "já existia" : efeito
    } (o atalho "reativar" só é desenhado em linha de item inativo).`,
  );
}

async function main(): Promise<void> {
  const slugs = process.argv
    .slice(2)
    .filter((a) => a.startsWith("--slug="))
    .map((a) => a.slice("--slug=".length));

  const roteiros = await carregarRoteiros(slugs.length > 0 ? slugs : undefined);
  if (roteiros.length === 0) {
    console.log("[ajuda] nenhum roteiro para conferir.");
    return;
  }

  await prepararDadoDosRoteiros(roteiros.map((r) => r.slug));

  const leitor = await abrirLeitorDaBase();
  const declaracao = exigirDeclaracaoDoArnes();
  const populacao = {
    candidatos: await leitor.amostrarPessoas("candidatos"),
    usuarios: await leitor.amostrarPessoas("usuarios"),
    // A TERCEIRA TABELA DE GENTE: `as_comerciais.rotulo` é nome de pessoa por natureza, e a régua dela
    // é a de `usuarios` (detecção por imagem), nunca a de população. Ver `lote.ts`.
    comerciais: await leitor.amostrarPessoas("comerciais"),
  };


  const veredictoDaBase = await conferirBaseAntesDoLote({
    allowlist: montarAllowlist([], declaracao),
    // `usuarios` é DETECÇÃO POR IMAGEM: o time do diretor testa na homologação e PERMANECE lá, então
    // o nome e o e-mail deles não barram o lote, eles são o que o gate procura em cada tela.
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM",
    amostrarPessoas: async (t) => populacao[t],
    // AS COLUNAS DE PESSOA (segundo veto do `seguranca`): `dados_vaga_folha.gestor_bp` e as
    // outras sete fontes. A regra mora em `lote.ts`; aqui só a leitura.
    amostrarColunaDePessoa: leitor.amostrarColunaDePessoa,
  });
  if (!veredictoDaBase.aprovado) {
    // Aqui NÃO é falha do manual, é falha do ambiente, e o texto tem de dizer isso: quem lê o CI
    // precisa distinguir "o artigo envelheceu" de "a homologação voltou a ter gente real".
    console.error(`[ajuda] AVISO DE AMBIENTE: ${veredictoDaBase.motivo}`);
  }
  /**
   * SÓ OS CANDIDATOS ENTRAM NA ALLOWLIST, e esta linha é metade da correção de premissa: antes ela
   * somava `...populacao.usuarios`, e o efeito era o oposto do pretendido, o nome e o e-mail
   * corporativo de cada colega do time viravam conteúdo AUTORIZADO em print. Agora os usuários vão
   * para a denylist que sai do próprio veredito da base.
   */
  const allowlist = montarAllowlist(populacao.candidatos, declaracao);
  /**
   * O VEREDITO DA BASE É O **PISO** DA DENYLIST, e não a palavra final dela: a proteção é remontada
   * ANTES DE CADA ROTEIRO, e cada remontagem só pode somar (ver `protecao-por-roteiro.ts`). O
   * arranque continua sendo quem AUTORIZA o lote; quem mantém a proteção viva é a remontagem.
   */
  let protecao = { negados: veredictoDaBase.negados, vocabulario: { valores: [] as string[] } };
  console.log(
    `[ajuda] denylist de equipe no arranque: ${protecao.negados.nomes.length} nome(s) e ` +
      `${protecao.negados.emails.length} e-mail(s) (lidos de \`usuarios\`; valores omitidos, §A.6).`,
  );

  const { navegador, page } = await abrirSessao();
  /**
   * A PÁGINA SEM SESSÃO é criada UMA vez e só se algum roteiro precisar dela: as telas públicas
   * (`/login`, `/trocar-senha`, `/portal`, `/vt`) rebatem quem tem sessão, então fotografá-las pela
   * página logada produziria a tela de DEPOIS de entrar. Ver `ehRotaPublica`.
   */
  let paginaPublica: Awaited<ReturnType<typeof abrirPaginaSemSessao>> | null = null;
  const falhas: string[] = [];
  try {
    for (const roteiro of roteiros) {
      try {
        const publica = ehRotaPublica(roteiro.url);
        if (publica && !paginaPublica) paginaPublica = await abrirPaginaSemSessao(navegador);
        const alvo = publica && paginaPublica ? paginaPublica : page;
        // A REMONTAGEM É POR ROTEIRO DE PROPÓSITO: usuário cadastrado no meio do lote entra na
        // proteção na imagem seguinte, em vez de ficar de fora até o fim. Não mover para o arranque.
        protecao = await remontarProtecao(leitor, allowlist, protecao.negados);
        console.log(descreverProtecao(roteiro.slug, protecao));
        await executarRoteiro(
          alvo,
          roteiro,
          "conferir",
          allowlist,
          protecao.negados,
          protecao.vocabulario,
        );
        console.log(
          `[ajuda] OK  ${roteiro.slug} (${roteiro.capturas.length} print(s))` +
            `${publica ? " [sem sessão]" : ""}`,
        );
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        falhas.push(mensagem);
        console.error(`[ajuda] FALHA  ${roteiro.slug}\n${mensagem}`);
      }
    }
  } finally {
    await navegador.close();
    await leitor.fechar();
  }

  if (falhas.length > 0 || !veredictoDaBase.aprovado) {
    console.error(
      `\n[ajuda] ${falhas.length} roteiro(s) com alvo perdido ou tela reprovada` +
        `${veredictoDaBase.aprovado ? "" : ", mais a base de homologação reprovada"}. Corrija o ` +
        `roteiro e o texto na MESMA entrega (§A.43).`,
    );
    process.exit(1);
  }
  console.log(`\n[ajuda] ${roteiros.length} roteiro(s) conferido(s), nenhum alvo perdido.`);
}

main().catch((erro: unknown) => {
  console.error(`\n[ajuda] FALHOU\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(1);
});
