/**
 * ─ O AMBIENTE DO MOTOR: TRAVADO NA HOMOLOGAÇÃO, SEGREDO FORA DO REPOSITÓRIO, GRAVAÇÃO SOB VETO ──
 *
 * ┌─ POR QUE A URL É CONSTANTE E NÃO CONFIGURAÇÃO ───────────────────────────────────────────────┐
 * │ Print vai para o repositório e repositório guarda para sempre (§A.6, mesma régua da §A.33: o   │
 * │ dano de gravar errado é irreversível). Uma variável de ambiente apontando o motor para a       │
 * │ produção (3010) seria um descuido de uma linha com consequência permanente, então a base NÃO   │
 * │ é configurável: ela é constante, e `exigirHomologacao` recusa qualquer outro destino.          │
 * │ §A.32: a homologação é a 3120, a produção é a 3010 e nunca é fonte de print.                   │
 * │                                                                                                │
 * │ E ATENÇÃO, porque esta trava é MENOS do que parece: ela prova o ENDEREÇO, não o CONTEÚDO. Uma  │
 * │ homologação recém-clonada e cheia de gente real satisfaz esta constante e a do nome do          │
 * │ database. Quem prova o conteúdo é `base-sintetica.ts`, e sem ele as duas travas daqui dão uma   │
 * │ falsa sensação de segurança.                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CREDENCIAL NUNCA ENTRA NO REPOSITÓRIO, EM LOG, NEM EM MENSAGEM DE ERRO. Ela é lida de um arquivo
 * de fora da árvore, usada em memória e nunca reaparece: todo erro do login é reescrito por uma
 * mensagem própria, porque erro de biblioteca pode citar o valor que tentou digitar. É o mesmo
 * motivo pelo qual trace e vídeo do Playwright ficam DESLIGADOS (`SEM_TRACE_NEM_VIDEO`): o trace
 * grava snapshot do DOM com valor de campo em texto claro, ou seja, a senha digitada.
 */
import fs from "node:fs";
import path from "node:path";
import type { DeclaracaoDoArnes } from "./allowlist";

/** A homologação, e só ela. Trocar esta linha é decisão consciente, não descuido de env. */
export const BASE_HOMOLOG = "http://127.0.0.1:3120";

/** Os hosts que SÃO a homologação (o mesmo serviço pelo loopback e pela rede interna). */
const HOSTS_DE_HOMOLOGACAO = new Set(["127.0.0.1:3120", "localhost:3120", "10.18.117.235:3120"]);

/**
 * ─ O VETO DO `seguranca` SOBRE A GRAVAÇÃO: LEVANTADO EM 27/09/2026 ─────────────────────────────
 *
 * Enquanto este sinalizador foi `true`, o motor fez TUDO menos escrever PNG: abriu, preparou,
 * resolveu alvos, anotou, mediu e passou pelos gates. O veto morava aqui, e não na disciplina de
 * quem roda o comando, porque "combinamos de não capturar ainda" não é um controle.
 *
 * ┌─ O QUE O VETO COMPROU, E VALE REGISTRAR PORQUE NÃO FOI BARATO ──────────────────────────────┐
 * │ Ele durou duas rodadas e, nas duas, achou coisa que teria ido para o repositório para sempre:│
 * │                                                                                              │
 * │   1. o gate lia o TEXTO da tela, e o CPF dos formulários não está no texto, está no VALOR do │
 * │      campo. Ele apareceria na imagem e ficaria invisível para o filtro, em telas que o manual│
 * │      PRECISA ensinar;                                                                        │
 * │   2. a correção da denylist entrou no núcleo testado e NÃO entrou no arquivo que grava, e o  │
 * │      auditor provou executando: a mesma tela, com nome e e-mail de colega real, recusada por │
 * │      um caminho e APROVADA, com zero achados, pelo que grava.                                 │
 * │                                                                                              │
 * │ Nenhum PNG foi escrito em nenhum dos dois momentos, e é isso que o veto existia para garantir.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LEVANTADO pelo `seguranca` depois de o `tester` travar o gate em teste (§A.38), com a flag
 * `.trabalho/LOTE-LIBERADO-PELA-SEGURANCA` registrando o veredito e o que ele NÃO autoriza.
 *
 * O QUE CONTINUA SEGURANDO, E NÃO É ESTE SINALIZADOR: a asserção de população recusa o lote
 * enquanto houver linha fora do padrão sintético em `candidatos`, a denylist da equipe recusa a
 * imagem que mostrar gente do time, e alvo não encontrado é falha dura. Baixar este sinalizador
 * não abriu nenhuma dessas três: ele era o quarto cadeado, e o único que dependia de decisão humana.
 *
 * ROTEIRO NOVO QUE ALCANCE TELA AINDA NÃO AUDITADA EXIGE NOVA AUDITORIA, e a flag diz quais são.
 */
export const GRAVACAO_VETADA = false;
export const MOTIVO_DO_VETO =
  "gravação de PNG VETADA pelo agente `seguranca` (§A.38) até o gate de PII estar travado em teste. " +
  "O motor roda em ENSAIO (`--ensaio`): anota, mede e confere, sem escrever imagem.";

/** Trace e vídeo NUNCA são ligados: o trace grava o valor dos campos, inclusive a senha digitada. */
export const SEM_TRACE_NEM_VIDEO = true;

const CAMINHO_SENHA_MASTER = "/home/henrique/SENHA-HOMOLOG-MASTER-AJUDA.txt";

/** O Playwright vive fora do repositório (arnês visual da fábrica) e só roda com as libs baixadas. */
export const CAMINHO_PLAYWRIGHT =
  "/home/henrique/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs";
export const LIBS_PLAYWRIGHT = "/home/henrique/.ea-harness/libs/root/usr/lib/x86_64-linux-gnu";

/** Viewport fixo: print que muda de tamanho polui o diff do git a cada rodada. */
export const VIEWPORT_CAPTURA = { width: 1600, height: 1000 };

export class FalhaDeMotor extends Error {}

/** Recusa qualquer destino que não seja a homologação. Fail-closed, inclusive para URL relativa. */
export function exigirHomologacao(url: string): string {
  const absoluta = url.startsWith("http")
    ? url
    : `${BASE_HOMOLOG}${url.startsWith("/") ? "" : "/"}${url}`;
  let alvo: URL;
  try {
    alvo = new URL(absoluta);
  } catch {
    throw new FalhaDeMotor(`URL de captura inválida: ${url}`);
  }
  if (!HOSTS_DE_HOMOLOGACAO.has(alvo.host)) {
    throw new FalhaDeMotor(
      `DESTINO RECUSADO: ${alvo.host}. O motor de captura só roda contra a homologação ` +
        `(${BASE_HOMOLOG}). A produção (porta 3010) nunca é fonte de print (§A.6, §A.32).`,
    );
  }
  return absoluta;
}

export type CredencialDeCaptura = { usuario: string; senha: string };

/**
 * A CONTA DA CAPTURA É UM **MASTER**, NÃO O SUPER ADMIN (conserto 7 do plano, linhas 278-279).
 *
 * O super admin enxerga o Diagnóstico Do Sistema e a administração de Usuários, que são justamente
 * duas das telas que NÃO podem ser capturadas inteiras, e ainda abre modais que renascem. Um MASTER
 * dedicado torna o motor determinístico e reduz o que a tela mostra ao que o manual ensina.
 *
 * FAIL-CLOSED: sem o arquivo de credencial, o motor NÃO cai para o super admin. Ele para. Criar
 * usuário ou trocar senha de alguém não é decisão da fábrica (§A.23).
 */
export function lerCredencialDeCaptura(): CredencialDeCaptura {
  let bruto: string;
  try {
    bruto = fs.readFileSync(CAMINHO_SENHA_MASTER, "utf8");
  } catch {
    throw new FalhaDeMotor(
      `CREDENCIAL DE CAPTURA AUSENTE (${CAMINHO_SENHA_MASTER}).\n` +
        `  O motor loga como um usuário MASTER da homologação, nunca como super admin: o super ` +
        `admin vê o Diagnóstico e a tela de Usuários, que não podem virar print inteiro.\n` +
        `  O motor NÃO cria usuário nem troca senha de ninguém (§A.23). Quem provê a conta é o ` +
        `diretor, e o arquivo fica FORA do repositório, com as linhas "usuario:" e "senha:".`,
    );
  }
  const valorDe = (chave: string) => {
    const linha = bruto
      .split("\n")
      .find((l) => l.trim().toLowerCase().startsWith(chave));
    return linha?.slice(linha.indexOf(":") + 1).trim();
  };
  const usuario = valorDe("usuario") ?? valorDe("email");
  const senha = valorDe("senha");
  if (!usuario || !senha) {
    throw new FalhaDeMotor(
      `A credencial de captura precisa das linhas "usuario:" e "senha:" (valor omitido do log).`,
    );
  }
  return { usuario, senha };
}

/** A raiz do repositório, resolvida a partir deste arquivo (tools/ajuda/src/ → ../../..). */
export function raizDoRepositorio(): string {
  return path.resolve(new URL("../../..", import.meta.url).pathname);
}

/** Diretório de trabalho do motor. IGNORADO pelo git: é onde saem propostas de curadoria e ensaios. */
export function dirDeTrabalho(): string {
  const dir = path.join(raizDoRepositorio(), "tools/ajuda/.trabalho");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * O QUE O ARNÊS DO MANUAL DECLAROU TER CRIADO (`tools/ajuda/allowlist-arnes.json`, gerado pelo
 * arnês). Ausente, NADA é declarado, e é o caso mais estrito: o gate recusa allowlist vazia.
 */
export function lerDeclaracaoDoArnes(): DeclaracaoDoArnes {
  const caminho = path.join(raizDoRepositorio(), "tools/ajuda/allowlist-arnes.json");
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8")) as DeclaracaoDoArnes;
  } catch {
    return {};
  }
}
