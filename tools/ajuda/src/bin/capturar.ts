/**
 * ─ `ajuda:capturar`: EXECUTA ROTEIROS E GRAVA OS PNGs ──────────────────────────────────────────
 *
 * ORDEM DAS TRAVAS, e ela não é decorativa: a mais barata e a que mais protege vem PRIMEIRO.
 *   1. O veto do `seguranca` sobre a gravação. De pé, só roda `--ensaio`.
 *   2. A ASSERÇÃO DE POPULAÇÃO da base (`conferirBaseAntesDoLote`): UMA linha fora do padrão
 *      sintético em `candidatos` ou `usuarios` e o lote não começa. É a trava que sobrevive ao
 *      re-clone da homologação, que as travas de URL e de nome de database não pegam.
 *   3. Lote precisa de liberação explícita em arquivo. Por padrão, captura é UM roteiro por vez.
 *   4. Por print, dentro de `executarCaptura`: alvo tem de existir e a tela tem de passar no gate.
 *
 * USO:
 *   pnpm ajuda:capturar --slug=<slug> [--ensaio]
 *   pnpm ajuda:capturar --todos              (exige a liberação do lote)
 */
import fs from "node:fs";
import path from "node:path";
import { conferirBaseAntesDoLote, executarLote } from "../../../../apps/frontend/src/ajuda/lote";
import { montarAllowlist } from "../allowlist";
import {
  FalhaDeMotor,
  GRAVACAO_VETADA,
  MOTIVO_DO_VETO,
  dirDeTrabalho,
} from "../ambiente";
import { garantirItemInativoDeExemplo } from "../arnes-catalogo";
import { abrirLeitorDaBase } from "../base-sintetica";
import { exigirDeclaracaoDoArnes } from "../declaracao";
import { abrirPaginaSemSessao, abrirSessao, executarRoteiro, type ModoMotor } from "../motor";

import { descreverProtecao, remontarProtecao } from "../protecao-por-roteiro";
import { ehRotaPublica } from "../../../../apps/frontend/src/ajuda/rotas";
import { carregarRoteiros } from "../roteiros";

/**
 * A LIBERAÇÃO DO LOTE MORA EM ARQUIVO, mesma ideia da flag da §A.7: o que autoriza um gesto
 * irreversível é um ato deliberado, não a memória de quem digita o comando. É o `seguranca` que a
 * cria ao aprovar o gate, e ela não é versionada.
 */
const NOME_DA_LIBERACAO = "LOTE-LIBERADO-PELA-SEGURANCA";

/**
 * ─ A RÉGUA DE `usuarios`, DECLARADA NUM LUGAR SÓ ────────────────────────────────────────────────
 *
 * Os usuários da homologação são REAIS: são o time do diretor testando, e eles PERMANECEM (não se
 * apaga, não se altera, não se desativa nenhum). Exigir população sintética ali era uma trava que,
 * aplicada ao mundo real, impediria a frente inteira. No lugar dela, DETECÇÃO POR IMAGEM: o nome e o
 * e-mail de cada usuário são lidos da tabela e recusam a IMAGEM em que aparecerem.
 *
 * `candidatos` NÃO ENTRA NESTE AFROUXAMENTO, e a régua lá segue estrita: uma linha fora do padrão e
 * o lote inteiro recusa.
 */
const REGUA_DE_USUARIOS = "DETECCAO_POR_IMAGEM" as const;

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
  const args = process.argv.slice(2);
  const ensaio = args.includes("--ensaio");
  const todos = args.includes("--todos");
  const slugs = args
    .filter((a) => a.startsWith("--slug="))
    .map((a) => a.slice("--slug=".length))
    .filter(Boolean);
  const modo: ModoMotor = ensaio ? "ensaiar" : "capturar";

  if (modo === "capturar" && GRAVACAO_VETADA) {
    throw new FalhaDeMotor(`${MOTIVO_DO_VETO}\n  Rode com --ensaio para exercitar o motor.`);
  }
  if (!todos && slugs.length === 0) {
    throw new FalhaDeMotor(`Informe --slug=<slug>, ou --todos para o lote.`);
  }
  const liberacao = path.join(dirDeTrabalho(), NOME_DA_LIBERACAO);
  if (todos && !fs.existsSync(liberacao)) {
    throw new FalhaDeMotor(
      `LOTE BLOQUEADO: falta ${liberacao}.\n` +
        `  Dependência dura do plano (seção 5): nenhuma captura em lote antes do veredito do ` +
        `\`seguranca\` sobre o gate de PII. Print com PII vai para o git e não volta.`,
    );
  }

  // A POPULAÇÃO É LIDA UMA VEZ, e daí saem DUAS allowlists:
  //   . a PROVISÓRIA (só o que o arnês declarou) é com que a base é CONFERIDA;
  //   . a FINAL (com os nomes da base) só é USADA dentro de `capturar`, que só roda se a conferência
  //     aprovar. Invertida a ordem, a allowlist autorizaria exatamente o que deveria barrar.
  const leitor = await abrirLeitorDaBase();
  const roteiros = await carregarRoteiros(todos ? undefined : slugs);
  await prepararDadoDosRoteiros(roteiros.map((r) => r.slug));
  const declaracao = exigirDeclaracaoDoArnes();
  const allowlistProvisoria = montarAllowlist([], declaracao);
  const populacao: Record<string, Awaited<ReturnType<typeof leitor.amostrarPessoas>>> = {
    candidatos: await leitor.amostrarPessoas("candidatos"),
    usuarios: await leitor.amostrarPessoas("usuarios"),
    // A TERCEIRA TABELA DE GENTE (achado do `seguranca`): `as_comerciais.rotulo` é nome de pessoa por
    // natureza, e o menu `clientes` desta conta entrega a lista. Régua de DETECÇÃO POR IMAGEM, igual à
    // de `usuarios`: o comercial é real e permanece, então ele não barra o lote, ele é PROCURADO.
    comerciais: await leitor.amostrarPessoas("comerciais"),
  };

  /**
   * SÓ OS CANDIDATOS ENTRAM NA ALLOWLIST, e esta linha é metade da correção de premissa (27/09/2026):
   * antes ela somava `...populacao.usuarios`, e o efeito era o oposto do pretendido, o nome e o
   * e-mail corporativo de cada colega do time viravam conteúdo AUTORIZADO em print. Os usuários
   * PERMANECEM na base (são o time testando) e agora vão para a DENYLIST, que sai do veredito da
   * própria asserção de arranque e chega ao gate por dentro de `executarLote`.
   */
  const allowlist = montarAllowlist(populacao.candidatos, declaracao);

  // FALHA CEDO, ANTES DE ABRIR NAVEGADOR: base suja não melhora depois do login, e a mensagem certa
  // é a da base. A conferência é refeita dentro de `executarLote`, que é a peça testada e a que
  // GARANTE a ordem; aqui é só para não gastar uma sessão inteira antes de dizer o que está errado.
  const previa = await conferirBaseAntesDoLote({
    allowlist: allowlistProvisoria,
    reguaDeUsuarios: REGUA_DE_USUARIOS,
    amostrarPessoas: async (t) => populacao[t],
    // AS COLUNAS DE PESSOA (segundo veto do `seguranca`): `dados_vaga_folha.gestor_bp` e as
    // outras sete fontes. A regra mora em `lote.ts`; aqui só a leitura.
    amostrarColunaDePessoa: leitor.amostrarColunaDePessoa,
  });
  if (!previa.aprovado) {
    throw new FalhaDeMotor(`${previa.motivo}\n  Nenhuma captura foi executada, em modo nenhum.`);
  }
  console.log(
    `[ajuda] base APROVADA: 0 linha fora do padrão sintético em \`candidatos\`, e ` +
      `${previa.negados.nomes.length} nome(s) mais ${previa.negados.emails.length} e-mail(s) de ` +
      `usuário real na denylist que o gate vai PROCURAR em cada tela (valores omitidos, §A.6).`,
  );

  const { navegador, page, usuario } = await abrirSessao();
  console.log(`[ajuda] sessão aberta como ${usuario} (modo ${modo}).`);
  /**
   * A PÁGINA SEM SESSÃO, criada só se algum roteiro precisar: as telas públicas rebatem quem tem
   * sessão, e fotografá-las pela página logada daria a tela de DEPOIS de entrar. O motor NUNCA digita
   * credencial nelas (§A.6): ele abre e fotografa. Ver `ehRotaPublica` e `abrirPaginaSemSessao`.
   */
  let paginaPublica: Awaited<ReturnType<typeof abrirPaginaSemSessao>> | null = null;
  try {
    // A ORDEM (conferir a base, depois capturar) é garantida pela peça TESTADA, não por este arquivo.
    await executarLote(roteiros, {
      allowlist: allowlistProvisoria,
      reguaDeUsuarios: REGUA_DE_USUARIOS,
      amostrarPessoas: async (t) => populacao[t],
    // AS COLUNAS DE PESSOA (segundo veto do `seguranca`): `dados_vaga_folha.gestor_bp` e as
    // outras sete fontes. A regra mora em `lote.ts`; aqui só a leitura.
    amostrarColunaDePessoa: leitor.amostrarColunaDePessoa,
      // A DENYLIST CHEGA AQUI PELO LOTE, não por variável de fora: quem recebe a licença de capturar
      // recebe, no mesmo ato, o conjunto que o gate tem de procurar em cada imagem.
      capturar: async (roteiro, negados) => {
        /**
         * ─ A PROTEÇÃO É REMONTADA AQUI, A CADA ROTEIRO, E O LOTE É O PISO ─────────────────────────
         *
         * A `negados` que o LOTE entrega é a do arranque, e ela entra como PISO da remontagem: o
         * conjunto usado nesta imagem contém tudo o que o lote autorizou procurar, MAIS quem tiver
         * entrado na tabela `usuarios` desde então. Nunca menos (`unirNegados`).
         *
         * A COSTURA DO LOTE CONTINUA INTEIRA, e é por isso que o piso vem dele e não de uma variável
         * de fora: quem recebe a licença de capturar recebe, no mesmo ato, o conjunto que o gate tem
         * de procurar. A remontagem só pode ENDURECER o que o lote entregou, jamais afrouxar.
         *
         * NÃO MOVA ISTO PARA O ARRANQUE. Um lote são ~400 imagens, e o colega cadastrado no meio
         * dele ficaria fora da proteção até o fim, com o gate verde (ver `protecao-por-roteiro.ts`).
         */
        const protecao = await remontarProtecao(leitor, allowlist, negados);
        console.log(descreverProtecao(roteiro.slug, protecao));
        const publica = ehRotaPublica(roteiro.url);
        if (publica && !paginaPublica) paginaPublica = await abrirPaginaSemSessao(navegador);
        if (publica) console.log(`[ajuda] ${roteiro.slug}: rota pública, capturando SEM sessão.`);
        const r = await executarRoteiro(
          publica && paginaPublica ? paginaPublica : page,
          roteiro,
          modo,
          allowlist,
          protecao.negados,
          protecao.vocabulario,
        );
        for (const rot of r.rotulos) {
          console.log(
            `[ajuda] ${r.slug}/${rot.print}: rótulo "${rot.texto}" no lado ${rot.lado}` +
              `${rot.ajustado ? " (ajustado por borda ou colisão)" : ""}`,
          );
        }
        console.log(
          modo === "capturar"
            ? `[ajuda] ${r.slug}: ${r.arquivos.length} print(s) gravado(s).`
            : `[ajuda] ${r.slug}: ENSAIO concluído, nenhuma imagem gravada.`,
        );
      },
    });
  } finally {
    await navegador.close();
    await leitor.fechar();
  }
}

main().catch((erro: unknown) => {
  console.error(`\n[ajuda] FALHOU\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(1);
});
