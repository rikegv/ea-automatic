/**
 * ─ A PROTEÇÃO É REMONTADA A CADA ROTEIRO, **DE PROPÓSITO** (decisão do coordenador, 27/09/2026) ──
 *
 * ┌─ NÃO "OTIMIZE" ISTO DE VOLTA PARA O ARRANQUE. LEIA ANTES ────────────────────────────────────┐
 * │ Ler a denylist e o vocabulário UMA vez, no arranque, é mais rápido e é o que estava escrito     │
 * │ antes. Parece melhor e é PIOR, por uma janela que foi medida e não suposta:                    │
 * │                                                                                                │
 * │   um lote do manual são ~400 imagens e dura bem mais do que um cadastro de usuário. O colega    │
 * │   que entrar na tabela `usuarios` DEPOIS do arranque NÃO estaria na denylist daquele lote, e o  │
 * │   nome dele apareceria em print com carimbo de gate verde. O gate teria funcionado exatamente   │
 * │   como escrito, e é isso que torna a falha silenciosa.                                         │
 * │                                                                                                │
 * │ O custo real: DUAS consultas por roteiro (uma em `usuarios`, ~35 linhas; uma união de onze      │
 * │ catálogos, ~6.100 valores). É barato perto do dano de um PNG com nome de colega, que o git      │
 * │ guarda para sempre e nenhum commit desfaz (§A.6, mesma régua irreversível da §A.33).           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ORDEM DAS TRÊS OPERAÇÕES É O CONTROLE, e nenhuma delas é trocável de lugar ───────────────┐
 * │ 1. LER `usuarios` e montar a denylist nova.                                                    │
 * │ 2. SOMAR à denylist que já havia (`unirNegados`): remontar nunca ENCOLHE a proteção, então uma  │
 * │    leitura torta ou um usuário removido não abrem o gate no meio do lote.                      │
 * │ 3. Só ENTÃO montar o vocabulário, passando a denylist JÁ SOMADA, para ele nascer subtraído.     │
 * │                                                                                                │
 * │ Montar o vocabulário antes do passo 2 o subtrairia da denylist ANTIGA, e um colega recém-       │
 * │ cadastrado cujo nome coincidisse com um valor de catálogo passaria a ser dispensado justamente  │
 * │ na rodada em que ele entrou. É o furo 1 do `seguranca` voltando pela porta do tempo.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nome e e-mail lidos ficam em MEMÓRIA e não saem daqui. O que é impresso é CONTAGEM.
 */
import { montarNegadosDeEquipe } from "../../../apps/frontend/src/ajuda/lote";
import {
  montarVocabularioDoSistema,
  unirNegados,
  type AllowlistArnes,
  type NegadosDeEquipe,
  type VocabularioDoSistema,
} from "../../../apps/frontend/src/ajuda/pii";
import type { LeitorDaBase } from "./base-sintetica";

export type ProtecaoDaTela = { negados: NegadosDeEquipe; vocabulario: VocabularioDoSistema };

/**
 * Remonta a proteção para O PRÓXIMO ROTEIRO.
 *
 * `anterior` é a proteção do roteiro passado, e ela entra como PISO: a denylist devolvida contém
 * tudo o que a anterior continha, mais o que a leitura nova trouxer.
 *
 * `allow` é a allowlist do ARNÊS (e só dela sai a subtração da conta sintética de captura). O
 * catálogo NUNCA passa por aqui como `allow`: ele é um conjunto separado, e somá-lo à allowlist
 * apagaria da denylist o usuário cujo nome coincidisse com um valor de catálogo (furo 1).
 */
export async function remontarProtecao(
  leitor: LeitorDaBase,
  allow: AllowlistArnes,
  anterior: NegadosDeEquipe,
): Promise<ProtecaoDaTela> {
  const usuarios = await leitor.amostrarPessoas("usuarios");
  /**
   * OS COMERCIAIS ENTRAM AQUI TAMBÉM, e pela mesma razão de a remontagem existir: `as_comerciais` é
   * catálogo EDITÁVEL, então o comercial cadastrado no meio de um lote de ~400 imagens precisa entrar
   * na proteção na imagem SEGUINTE, não no lote seguinte. Leitura vazia não encolhe nada: o piso é o
   * `unirNegados` abaixo.
   */
  const comerciais = await leitor.amostrarPessoas("comerciais");
  /**
   * LEITURA VAZIA NÃO ZERA A PROTEÇÃO. Zero usuário não é "time nenhum": é consulta que falhou,
   * conexão que caiu ou tabela renomeada, e é o momento em que abrir o gate seria pior. Sem o
   * `unirNegados` abaixo isso já estaria resolvido pelo piso, mas o caso é dito aqui porque a
   * tentação, ao ler este trecho, é "pular a remontagem quando não veio nada".
   */
  const negados = unirNegados(
    unirNegados(anterior, montarNegadosDeEquipe(usuarios, allow)),
    montarNegadosDeEquipe(comerciais, allow),
  );
  const catalogos = await leitor.amostrarVocabulario();
  return { negados, vocabulario: montarVocabularioDoSistema(catalogos, negados) };
}

/** Uma linha de pulso com CONTAGEM, nunca com valor (§A.6). */
export function descreverProtecao(slug: string, p: ProtecaoDaTela): string {
  return (
    `[ajuda] ${slug}: proteção remontada, ${p.negados.nomes.length} nome(s) e ` +
    `${p.negados.emails.length} e-mail(s) na denylist, ${p.vocabulario.valores.length} valor(es) ` +
    `de catálogo dispensáveis por igualdade inteira (valores omitidos, §A.6).`
  );
}
