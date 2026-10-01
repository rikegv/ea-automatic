import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, admissoes, candidatos } from "../db/schema";
import {
  montarPessoaParaGi,
  RETENCAO_DADOS_GI_MS,
  type CandidatoParaGi,
  type DadosGiParaPessoa,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * O LEITOR do Portal→GI (peça 3): monta o `PessoaParaGi` de uma admissão juntando `candidatos` (o que
 * o EA já tinha) + `admissao_dados_gi` (o que o Portal coletou). É a camada de I/O; a JUNÇÃO em si é
 * a função pura `montarPessoaParaGi` (testável sem banco).
 *
 * §A.6: lê SÓ dado de PESSOA. Não toca salário, folha nem situação trabalhista (nem existem nestas
 * tabelas nesse recorte). Nada é logado aqui: o serviço não tem logger de propósito, o valor não
 * passa por log em hipótese nenhuma.
 */
@Injectable()
export class GiLeitorService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Monta o `PessoaParaGi` da admissão. `null` quando a admissão não existe ou não tem candidato: o
   * gatilho manual trata isso como "sem dados de pessoa" e não envia (fail-closed).
   */
  async lerPessoa(admissaoId: string): Promise<PessoaParaGi | null> {
    const [linha] = await this.db
      .select({
        cand: {
          nome: candidatos.nome,
          cpf: candidatos.cpf,
          dataNascimento: candidatos.dataNascimento,
          sexo: candidatos.sexo,
          email: candidatos.email,
          telefone: candidatos.telefone,
          banco: candidatos.banco,
          agencia: candidatos.agencia,
          conta: candidatos.conta,
        },
        dados: {
          nacionalidade: admissaoDadosGi.nacionalidade,
          naturalidade: admissaoDadosGi.naturalidade,
          filiacaoNomeMae: admissaoDadosGi.filiacaoNomeMae,
          filiacaoNomePai: admissaoDadosGi.filiacaoNomePai,
          estadoCivil: admissaoDadosGi.estadoCivil,
          raca: admissaoDadosGi.raca,
          grauInstrucao: admissaoDadosGi.grauInstrucao,
          rgNumero: admissaoDadosGi.rgNumero,
          rgOrgaoEmissor: admissaoDadosGi.rgOrgaoEmissor,
          rgUf: admissaoDadosGi.rgUf,
          rgDataEmissao: admissaoDadosGi.rgDataEmissao,
          ctpsNumero: admissaoDadosGi.ctpsNumero,
          ctpsSerie: admissaoDadosGi.ctpsSerie,
          ctpsUf: admissaoDadosGi.ctpsUf,
          ctpsData: admissaoDadosGi.ctpsData,
          pis: admissaoDadosGi.pis,
          tituloNumero: admissaoDadosGi.tituloNumero,
          tituloZona: admissaoDadosGi.tituloZona,
          tituloSecao: admissaoDadosGi.tituloSecao,
          reservistaNumero: admissaoDadosGi.reservistaNumero,
          cnhNumero: admissaoDadosGi.cnhNumero,
          cnhDataEmissao: admissaoDadosGi.cnhDataEmissao,
          cnhDataValidade: admissaoDadosGi.cnhDataValidade,
          endCep: admissaoDadosGi.endCep,
          endLogradouro: admissaoDadosGi.endLogradouro,
          endNumero: admissaoDadosGi.endNumero,
          endComplemento: admissaoDadosGi.endComplemento,
          endBairro: admissaoDadosGi.endBairro,
          endCidade: admissaoDadosGi.endCidade,
          endUf: admissaoDadosGi.endUf,
        },
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(admissaoDadosGi, eq(admissaoDadosGi.admissaoId, admissoes.id))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);

    if (!linha) return null;
    return montarPessoaParaGi(linha.cand as CandidatoParaGi, linha.dados as DadosGiParaPessoa);
  }

  /**
   * IDEMPOTÊNCIA: a admissão já foi enviada ao GI? `true` quando `gi_enviado_em` está preenchido. O
   * gatilho manual consulta isto ANTES de montar/enviar: não recria na retentativa.
   */
  async jaEnviado(admissaoId: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ enviadoEm: admissaoDadosGi.giEnviadoEm })
      .from(admissaoDadosGi)
      .where(eq(admissaoDadosGi.admissaoId, admissaoId))
      .limit(1);
    return !!linha?.enviadoEm;
  }

  /**
   * Carimba o envio na linha da admissão (a marca de idempotência). Chamado SÓ após a criação real no
   * GI confirmar.
   *
   * É UPSERT, E ISSO É O CONSERTO: antes era um `UPDATE ... WHERE admissao_id = ?`, que **não criava a
   * linha**. Quando ela não existia (envio de uma admissão cujo candidato nunca passou pelo Portal, ou
   * cuja linha foi expurgada pelo TTL), o `UPDATE` afetava ZERO linhas **sem erro**, o carimbo não
   * existia, `jaEnviado` continuava devolvendo `false` e a retentativa criava um SEGUNDO
   * `FuncionarioSelecao` na produção do fornecedor. Com o upsert no unique de `admissao_id`, a marca
   * de idempotência passa a existir sempre.
   *
   * §A.6, E É A PARTE QUE EXIGIU DECISÃO: a linha de `admissao_dados_gi` tem `expurgar_em`, que é o
   * TETO de retenção. Linha criada por aqui nasceria SEM teto (nulo), e `dadoGiExpirado` trata nulo
   * como "não expurga" de propósito (sem relógio, não apaga por engano), então o dado ficaria no EA
   * para sempre. Por isso o INSERT carimba `expurgar_em` com `RETENCAO_DADOS_GI_MS` a partir de agora,
   * a MESMA constante que a peça 2 usa na confirmação do candidato. No conflito (linha já existe) o
   * `expurgar_em` NÃO é tocado: o teto de quem confirmou é dele, e re-carimbar aqui ESTENDERIA a
   * retenção de uma linha que já estava contando, o que vai na direção contrária da minimização.
   */
  async marcarEnviado(admissaoId: string, funcionarioSelecaoId: string | null): Promise<void> {
    const agora = new Date();
    const carimbo = {
      giEnviadoEm: agora,
      ...(funcionarioSelecaoId ? { giFuncionarioSelecaoId: funcionarioSelecaoId } : {}),
    };
    await this.db
      .insert(admissaoDadosGi)
      .values({
        admissaoId,
        ...carimbo,
        // Teto de retenção obrigatório na linha NOVA (§A.6). Só vale no insert: no conflito, o
        // `expurgar_em` existente é preservado (ver o comentário acima).
        expurgarEm: new Date(agora.getTime() + RETENCAO_DADOS_GI_MS),
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: admissaoDadosGi.admissaoId,
        set: { ...carimbo, atualizadoEm: agora },
      });
  }
}
