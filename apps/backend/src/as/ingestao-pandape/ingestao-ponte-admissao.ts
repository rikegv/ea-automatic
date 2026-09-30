import { Inject, Injectable } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { AdmissoesService } from "../../admissoes/admissoes.service";
import {
  ocupadasPorLado,
  SITUACOES_QUE_CONSOMEM_POSICAO,
  tetoDoLado,
} from "../../domain/candidatura";
import { CandidatosService } from "../candidatos/candidatos.service";
import type { PortaPonteParaAdmissao, ResultadoDaPonte } from "./ingestao-portas";

/**
 * ─ A PONTE DA VARREDURA PARA A ESTEIRA: O ADAPTADOR DE PRODUÇÃO ────────────────────────────────
 *
 * O ciclo (`ingestao-ciclo.ts`) decide QUANDO a ponte acontece; este arquivo é quem a executa. A
 * separação é a mesma do `IngestaoRepositorio`, e o ganho é o mesmo: a regra do quando se audita sem
 * Postgres e sem o módulo de Admissões, e o como vive num lugar só.
 *
 * ┌─ POR QUE ELE REUSA O CAMINHO MANUAL, EM VEZ DE ESCREVER A ADMISSÃO À MÃO ────────────────────┐
 * │ A pré-admissão do funil tem regra acumulada: nasce em `AGUARDANDO_LIBERACAO` (nunca            │
 * │ `EM_ADMISSAO`, senão pularia o dedup de CPF e a régua por vínculo, que moram no                │
 * │ `aplicarLiberacao`), captura o unique parcial `uq_admissao_cpf_vaga_viva` como IDEMPOTÊNCIA,    │
 * │ grava o CPF do substituído com TTL de 48h (§A.6, regra 10 da §A.3) e valida o dígito antes de   │
 * │ qualquer escrita. Um segundo escritor de admissão teria a própria cópia dessas cinco coisas, e  │
 * │ a cópia nova não seria auditada por nenhum dos testes que protegem a primeira.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A LEITURA VEM DO `CandidatosService`, E ISSO É DELIBERADO ──────────────────────────────────┐
 * │ `dadosDaPonteParaAdmissao` é o SNAPSHOT (candidato + vaga) no formato que                      │
 * │ `criarPreAdmissaoDoFunil` consome, e o mapeamento vaga para folha é conservador de propósito    │
 * │ (só o que a vaga SABE). Copiá-lo para cá criaria duas versões do mesmo mapeamento, e a que      │
 * │ ficasse desatualizada seria justamente a que nenhuma tela mostra. O método só trocou de         │
 * │ visibilidade: `private` para público. Modificador de TypeScript não existe em tempo de          │
 * │ execução, então o caminho manual validado não mudou em NADA.                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SEM AUTOR HUMANO, E NUNCA UM USUÁRIO DE SISTEMA ───────────────────────────────────────────┐
 * │ A ingestão não tem sessão. `criarPreAdmissaoDoFunil` não pede autor, e é por isso que ela serve │
 * │ aqui sem inventar ninguém. O caminho manual registra trilha da candidatura com `por_id` do      │
 * │ consultor; aqui não há consultor, e a ponte NÃO escreve trilha de etapa (a linha não mudou de   │
 * │ caneco: ela NASCEU). Medido e registrado: o UUID zero de "usuário sistema" NÃO existe em        │
 * │ `usuarios`, e as colunas de autor têm FK, então usá-lo estouraria 23503.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhuma linha daqui loga qualquer coisa. Quem loga é o ciclo, e só o RÓTULO do motivo. O CPF
 * circula como valor a gravar e nunca como texto de log.
 */
@Injectable()
export class IngestaoPonteParaAdmissao implements PortaPonteParaAdmissao {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly candidatos: CandidatosService,
    private readonly admissoes: AdmissoesService,
  ) {}

  /**
   * A PONTE, na ORDEM em que ela tem de acontecer.
   *
   * 1. `admissao_id` JÁ PREENCHIDO é o registro local do "já fiz", e ele é lido ANTES de tudo. Sem
   *    esta leitura, cada volta de 30 minutos faria uma chamada inútil por candidatura e, no caso em
   *    que a admissão já saiu de `AGUARDANDO_LIBERACAO` para `ADMISSAO_CONCLUIDA` ou `DECLINOU`, o
   *    unique parcial da admissão NÃO protege mais (o predicado dele é só de farol vivo) e uma
   *    SEGUNDA admissão nasceria da mesma candidatura.
   * 2. CPF AUSENTE OU INVÁLIDO ADIA, e não falha: a candidatura já está gravada, o ciclo segue, e o
   *    caso vira contagem no resumo. Mesma disciplina do "adiar em vez de inventar `cod_cliente`"
   *    (§A.5). O validador é o mesmo do resto do sistema, pela razão do dedup: um lixo repetido no
   *    ATS (`00000000000`) juntaria pessoas diferentes, e fusão de ficha é irreversível.
   * 3. CLIENTE E CARGO NULOS ENTRAM ASSIM MESMO. É o desenho explícito da Liberação Admissional:
   *    vira pendência na tela, nunca `cod_cliente` inventado.
   * 4. A GRAVAÇÃO DE `admissao_id` VEM DEPOIS DA CRIAÇÃO, nesta ordem, porque é ela que a guarda do
   *    passo 1 lê: gravar antes de criar deixaria a candidatura apontando para uma admissão que
   *    pode não ter nascido.
   */
  async criar(candidaturaId: string): Promise<ResultadoDaPonte> {
    const linhas = (await this.db.execute(sql`
      select admissao_id, vaga_id from as_candidaturas where id = ${candidaturaId}::uuid limit 1
    `)) as unknown as { admissao_id: string | null; vaga_id: string }[];
    const linha = linhas[0];
    if (!linha) return { feita: false, motivo: "CANDIDATURA_AUSENTE" };
    if (linha.admissao_id !== null) return { feita: false, motivo: "JA_TEM_ADMISSAO" };

    const ponte = await this.candidatos.dadosDaPonteParaAdmissao(candidaturaId);
    if (!ponte) return { feita: false, motivo: "CANDIDATURA_AUSENTE" };

    const cpf = normalizeCpf(ponte.candidato.cpf ?? "");
    if (!isValidCpf(cpf)) return { feita: false, motivo: "SEM_CPF" };

    /*
     * `possivelDuplicata` É CONTA AO VIVO, com o MESMO critério do caminho manual e do Pandapé: já
     * há admissão viva deste CPF cujo par de vaga não dá para casar com segurança. Ela NÃO bloqueia,
     * só sinaliza na tela, e é isso que a torna adequada a um caminho automático.
     */
    const vivas = await this.admissoes.vivasPorCpf(cpf);
    const possivelDuplicata =
      vivas.length > 0 && (!ponte.idVacancy || vivas.some((v) => !v.idVacancy));

    const { admissaoId } = await this.admissoes.criarPreAdmissaoDoFunil({
      candidato: {
        cpf,
        nome: ponte.candidato.nome,
        email: ponte.candidato.email,
        telefone: ponte.candidato.telefone,
        dataNascimento: ponte.candidato.dataNascimento,
      },
      codCliente: ponte.codCliente,
      cargoId: ponte.cargoId,
      idVacancy: ponte.idVacancy,
      vagaFolha: ponte.vagaFolha,
      possivelDuplicata,
    });

    /*
     * A SEGUNDA ESCRITA DE `as_candidaturas.admissao_id` NO SISTEMA (a primeira é o caminho manual),
     * e ela é CONDICIONAL: `admissao_id is null` no `where` fecha a corrida com o caminho manual, em
     * que um consultor envia a mesma pessoa para a admissão no intervalo entre a leitura do passo 1
     * e esta gravação. Sobrescrever ali trocaria o apontamento por outro em silêncio, e a admissão
     * do consultor ficaria órfã da candidatura que a originou.
     *
     * `atualizado_em` É ESCRITO UMA VEZ, no nascimento da ponte, e isso NÃO é a escrita repetida que
     * a trava do relógio de expurgo proíbe: candidatura que já tem `admissao_id` não volta aqui.
     */
    await this.db.execute(sql`
      update as_candidaturas
         set admissao_id = ${admissaoId}::uuid,
             atualizado_em = now()
       where id = ${candidaturaId}::uuid
         and admissao_id is null
    `);

    return { feita: true, posicaoExcedida: await this.posicaoExcedida(linha.vaga_id) };
  }

  /**
   * A VAGA PASSOU DO TETO DO LADO OFICIAL COM ESTA ENTRADA?
   *
   * ELA NÃO TRAVA NADA, E ISSO É PREMISSA DECLARADA: a ingestão escreve o FATO do ATS (a pessoa foi
   * contratada lá) e conta o excesso, porque recusar o fato faria a base divergir da realidade em
   * silêncio. Travar por meta interna é decisão do diretor, não da ingestão.
   *
   * A CONTA É A DO DOMÍNIO, e não uma cópia em SQL: `SITUACOES_QUE_CONSOMEM_POSICAO` é a mesma lista
   * que a trava do funil usa, `ocupadasPorLado` é quem dobra o `posicao_lado` nulo em OFICIAL (em um
   * lugar só, para nenhuma consulta escrever o próprio `coalesce`) e `tetoDoLado` é quem sabe que
   * cada lado é medido contra a meta DELE. A candidatura da ponte nasce com lado nulo, ou seja
   * OFICIAL, então é o teto oficial que responde. META NULA NÃO ACUSA NADA: vaga que ninguém
   * dimensionou não tem teto a exceder, e inventar um produziria alarme sobre rascunho.
   */
  private async posicaoExcedida(vagaId: string): Promise<boolean> {
    const metas = (await this.db.execute(sql`
      select posicoes_oficiais, posicoes_banco from vagas where id = ${vagaId}::uuid limit 1
    `)) as unknown as { posicoes_oficiais: number | null; posicoes_banco: number | null }[];
    const meta = metas[0];
    if (!meta) return false;
    const teto = tetoDoLado("OFICIAL", meta.posicoes_oficiais, meta.posicoes_banco);
    if (teto === null) return false;
    const situacoes = sql.join(
      SITUACOES_QUE_CONSOMEM_POSICAO.map((situacao: string) => sql`${situacao}`),
      sql`, `,
    );
    /*
     * A LISTA VIRA UM PARÂMETRO POR VALOR, e nunca um literal montado à mão: é a mesma lição já
     * paga em `encerrarAusentes` (drizzle sobre postgres-js não liga array de JS a array de
     * Postgres, e a instrução que não executa é pior do que a ausente, porque o chamador engole o
     * erro e soma um contador).
     */
    const linhas = (await this.db.execute(sql`
      select posicao_lado as lado, count(*)::int as quantas
        from as_candidaturas
       where vaga_id = ${vagaId}::uuid
         and situacao in (${situacoes})
       group by posicao_lado
    `)) as unknown as { lado: string | null; quantas: number }[];
    return ocupadasPorLado(linhas).OFICIAL > teto;
  }
}
