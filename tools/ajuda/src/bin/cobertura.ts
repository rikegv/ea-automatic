/**
 * ─ `ajuda:cobertura`: O DETECTOR DE CONTROLE ÓRFÃO, EM MODO RELATÓRIO ──────────────────────────
 *
 * ┌─ A PERGUNTA QUE ESTE COMANDO RESPONDE COM NÚMERO ────────────────────────────────────────────┐
 * │ "O manual cobre cada recurso de cada tela?" Até hoje a fábrica só sabia OPINAR, e foi uma       │
 * │ opinião não medida que produziu o inventário de 84 peças, que estava pela metade. Este comando   │
 * │ abre cada tela logado, enumera os controles desenhados nela e compara com os `Passo.controles`   │
 * │ que os artigos declaram. O que existe na tela e em artigo nenhum é lacuna MEDIDA.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELE NÃO GRAVA IMAGEM E NÃO DERRUBA NADA NESTA FASE. Sai com 0 mesmo cheio de lacuna: existem 3
 * artigos e centenas de controles, e travar o CI agora pararia toda frente do sistema por lacunas que
 * a construção do manual vai fechar nas Fases 1 a 5. O modo duro é uma constante no núcleo
 * (`COBERTURA_E_FALHA_DURA`), ligada na Fase 6, e a condição dele já está escrita e testada.
 *
 * §A.6: o relatório NÃO carrega nome de pessoa. Cada rótulo passa pelo MESMO gate que audita as
 * telas antes de entrar em qualquer linha impressa ou gravada, e rótulo de linha de tabela (que
 * carrega o dado da linha) é descartado e só contado.
 *
 * Uso:
 *   pnpm ajuda:cobertura                  todas as telas do sistema
 *   pnpm ajuda:cobertura --rota=/esteira  uma tela, para conferir uma frente
 */
import fs from "node:fs";
import path from "node:path";
import {
  medirCobertura,
  prepararCatalogo,
  reprovaEmModoDuro,
  resumirParaDiretor,
  COBERTURA_E_FALHA_DURA,
  RESPOSTA_AO_CONTROLES_OPCIONAL,
  type TelaEnumerada,
} from "../../../../apps/frontend/src/ajuda/cobertura";
import { conferirBaseAntesDoLote } from "../../../../apps/frontend/src/ajuda/lote";
import { auditarTexto } from "../../../../apps/frontend/src/ajuda/pii";
import { ARTIGOS } from "../../../../apps/frontend/src/ajuda/conteudo/registro.gerado";
import {
  ROTAS_FORA_DA_ENUMERACAO,
  rotasDeArquivosDePagina,
} from "../../../../apps/frontend/src/ajuda/rotas";
import { montarAllowlist } from "../allowlist";
import { dirDeTrabalho, exigirHomologacao, raizDoRepositorio } from "../ambiente";
import { abrirLeitorDaBase } from "../base-sintetica";
import { lerControlesDaTela } from "../controles-da-tela";
import { exigirDeclaracaoDoArnes } from "../declaracao";
import { abrirSessao, fecharModaisDeEntrada } from "../motor";
import { descreverProtecao, remontarProtecao } from "../protecao-por-roteiro";

/** Varre o disco atrás dos arquivos de página. Quem decide o que é rota é o núcleo puro. */
function arquivosDePagina(): string[] {
  const raiz = path.join(raizDoRepositorio(), "apps/frontend/src/app");
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) andar(completo);
      else if (entrada.name === "page.tsx") achados.push(path.relative(raiz, completo));
    }
  };
  andar(raiz);
  return achados;
}

async function main(): Promise<void> {
  const pedidas = process.argv
    .slice(2)
    .filter((a) => a.startsWith("--rota="))
    .map((a) => a.slice("--rota=".length));

  const todas = rotasDeArquivosDePagina(arquivosDePagina());
  const rotas = pedidas.length > 0 ? pedidas : todas;
  if (rotas.length === 0) {
    console.error("[ajuda] nenhuma rota para enumerar.");
    process.exit(1);
  }

  console.log(
    `[ajuda] cobertura: ${rotas.length} tela(s) a enumerar, ${ARTIGOS.length} artigo(s) no registro.`,
  );
  if (pedidas.length === 0) {
    console.log(
      `[ajuda] fora da enumeração, com motivo declarado: ` +
        `${ROTAS_FORA_DA_ENUMERACAO.map((f) => f.rota).join(", ")}.`,
    );
  }

  /**
   * O GATE DE PII DO RELATÓRIO, montado pelo MESMO caminho do lote de captura: allowlist do arnês,
   * denylist da equipe lida de `usuarios`, vocabulário de catálogo já subtraído da denylist. A base
   * reprovada AVISA e não bloqueia: aqui nada é gravado como imagem, e a proteção do relatório é o
   * gate por rótulo, não a população.
   */
  const leitor = await abrirLeitorDaBase();
  const declaracao = exigirDeclaracaoDoArnes();
  const candidatos = await leitor.amostrarPessoas("candidatos");
  const veredictoDaBase = await conferirBaseAntesDoLote({
    allowlist: montarAllowlist([], declaracao),
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM",
    // Cada tabela pela sua consulta (candidatos já lido acima): `comerciais` é a terceira tabela de
    // gente, e lê-la pelo nome evita o ternário que a mandava para `usuarios` em silêncio.
    amostrarPessoas: async (t) => (t === "candidatos" ? candidatos : leitor.amostrarPessoas(t)),
    // AS COLUNAS DE PESSOA (segundo veto do `seguranca`): aqui a reprovação é AVISO DE AMBIENTE, não
    // trava, porque a cobertura não grava imagem. O que ela protege é o RÓTULO impresso, e isso é o
    // gate por rótulo mais a poda, logo abaixo.
    amostrarColunaDePessoa: leitor.amostrarColunaDePessoa,
  });
  if (!veredictoDaBase.aprovado) {
    console.error(`[ajuda] AVISO DE AMBIENTE: ${veredictoDaBase.motivo}`);
  }
  const allowlist = montarAllowlist(candidatos, declaracao);
  const protecao = await remontarProtecao(leitor, allowlist, veredictoDaBase.negados);
  console.log(descreverProtecao("cobertura", protecao));

  const aprovarRotulo = (rotulo: string): boolean =>
    auditarTexto(rotulo, allowlist, protecao.negados, protecao.vocabulario).aprovado;

  /**
   * A PODA R2 (ver `analisarRotulo`): o rótulo do botão de LINHA carrega o valor da linha ("Editar
   * ADVANCE BIONICS"), e isso é dado, não nome de controle. A lista é a MESMA que o gate de PII lê do
   * banco, então cliente novo entra sozinho e o botão da linha dele já nasce reduzido ao nome do botão.
   */
  const catalogo = prepararCatalogo(protecao.vocabulario.valores);
  console.log(
    `[ajuda] poda de valor de catálogo: ${catalogo.size} valor(es) do banco com 4 letras ou mais ` +
      `(de ${protecao.vocabulario.valores.length} lidos; valores omitidos, §A.6).`,
  );

  /**
   * ─ A PODA R3: O NOME DA PESSOA TAMBÉM É DADO ───────────────────────────────────────────────────
   *
   * O rótulo do botão de linha interpola o nome ("Ver ficha de <nome>", "Editar admissão de
   * <nome>"), e NENHUM artigo pode declarar isso: o nome muda a cada linha, e escrevê-lo no artigo
   * seria dado pessoal dentro do manual (§A.6). Sem a poda, a única forma de fechar a lacuna seria
   * uma violação.
   *
   * A FONTE É A MESMA DO GATE, e é isso que a mantém viva: os candidatos vêm da consulta que monta a
   * allowlist, e os usuários do time vêm da denylist que a proteção já remontou. Pessoa nova entra
   * sozinha. Nenhum nome é impresso, aqui nem no relatório: o que sai é CONTAGEM.
   */
  /**
   * `sala_espera` ENTRA NA PODA (escalado pelo `devops` da cobertura e confirmado pelo `seguranca`): o
   * rótulo do botão daquela tela interpola o nome de quem está na sala, que é pessoa como qualquer
   * outra, e aqueles nomes NÃO estão em `candidatos`.
   *
   * E A PODA **NÃO É PROTEÇÃO**, é relatório: ela só impede o NOME de entrar na lista de lacunas
   * impressa. Confundir as duas coisas é o erro que o `seguranca` nomeou: podar esconde o furo do
   * relatório e o valor continua indo para o PNG.
   *
   * ┌─ CORREÇÃO DE 28/09/2026: `sala_espera` NÃO ESTÁ MAIS NA ASSERÇÃO DE POPULAÇÃO ──────────────┐
   * │ Este bloco dizia que "o que protege a imagem é a asserção de população (`sala_espera` está    │
   * │ lá)". Ficou FALSO: por decisão do diretor, aquela fonte passou à régua `LIBERADA` em          │
   * │ `lote.ts`, ou seja, não é lida, não reprova e não alimenta denylist. O que protege a imagem   │
   * │ daquela tela hoje é o gate por tela, e só ele.                                               │
   * │                                                                                              │
   * │ ESTA LINHA VIROU A ÚNICA LEITURA DE `sala_espera` QUE SOBROU no motor, e é por isso que a     │
   * │ consulta dela continua existindo em `base-sintetica.ts`. Quem for remover consultas de fonte  │
   * │ liberada por parecerem mortas derruba este comando em runtime, pela falha dura da fonte sem   │
   * │ consulta.                                                                                    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const daSalaDeEspera = (await leitor.amostrarColunaDePessoa("sala_espera"))
    .map((l) => l.nome ?? "")
    .filter(Boolean);
  const pessoas = prepararCatalogo([
    ...candidatos.map((c) => c.nome ?? "").filter(Boolean),
    ...protecao.negados.nomes,
    ...daSalaDeEspera,
  ]);
  console.log(
    `[ajuda] poda de nome de pessoa: ${pessoas.size} nome(s) (candidatos da base, a denylist da ` +
      `equipe e a sala de espera; valores omitidos, §A.6).`,
  );

  const telas: TelaEnumerada[] = [];
  const rebatidas: string[] = [];
  let semNome = 0;
  const { navegador, page } = await abrirSessao();
  try {
    for (const rota of rotas) {
      try {
        await page.goto(exigirHomologacao(rota), { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        await fecharModaisDeEntrada(page);
        const leitura = await lerControlesDaTela(page, rota);
        semNome += leitura.semNome;
        // REBATE É MEDIDO, NÃO SUPOSTO: tela que a conta de captura não pode abrir devolve os
        // controles de OUTRA tela, e contá-los ali mediria a tela errada com cara de medição boa.
        if (leitura.rotaEfetiva.replace(/\/+$/, "") !== rota.replace(/\/+$/, "")) {
          rebatidas.push(`${rota} -> ${leitura.rotaEfetiva}`);
          continue;
        }
        telas.push({ rota, controles: leitura.controles });
        console.log(
          `[ajuda] ${rota}: ${leitura.controles.length} controle(s) com nome` +
            `${leitura.semNome > 0 ? `, ${leitura.semNome} sem nome acessível` : ""}.`,
        );
      } catch (erro) {
        console.error(
          `[ajuda] FALHA ao enumerar ${rota}: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
  } finally {
    await navegador.close();
    await leitor.fechar();
  }

  const relatorio = medirCobertura({ telas, artigos: ARTIGOS, aprovarRotulo, catalogo, pessoas });

  console.log(`\n${"=".repeat(96)}`);
  console.log(resumirParaDiretor(relatorio));
  if (rebatidas.length > 0) {
    console.log("");
    console.log(
      `TELAS QUE A CONTA DE CAPTURA NAO ABRE (${rebatidas.length}), fora da conta: ` +
        `${rebatidas.join("; ")}.`,
    );
  }
  if (semNome > 0) {
    console.log("");
    console.log(
      `${semNome} controle(s) desenhado(s) SEM nome acessivel. Nao e lacuna de manual (nao ha ` +
        `rotulo para o artigo declarar): e defeito de acessibilidade, e fica registrado aqui.`,
    );
  }
  console.log("");
  console.log(`REGUA DO CAMPO OPCIONAL: ${RESPOSTA_AO_CONTROLES_OPCIONAL}`);
  console.log(
    `MODO: ${COBERTURA_E_FALHA_DURA ? "FALHA DURA" : "RELATORIO"}. ` +
      `Em modo duro este relatorio ${reprovaEmModoDuro(relatorio) ? "REPROVARIA" : "passaria"}.`,
  );
  console.log("=".repeat(96));

  const destino = path.join(dirDeTrabalho(), "cobertura.json");
  fs.writeFileSync(destino, `${JSON.stringify(relatorio, null, 2)}\n`);
  console.log(`\n[ajuda] detalhe completo por tela em ${destino}`);

  if (COBERTURA_E_FALHA_DURA && reprovaEmModoDuro(relatorio)) process.exit(1);
}

main().catch((erro: unknown) => {
  console.error(`\n[ajuda] FALHOU\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(1);
});
