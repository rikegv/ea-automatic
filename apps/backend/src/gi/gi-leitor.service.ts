import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, admissoes, candidatos, clienteVinculos, dadosVagaFolha } from "../db/schema";
import {
  montarContratacaoGi,
  montarPessoaParaGi,
  RETENCAO_DADOS_GI_MS,
  type CandidatoParaGi,
  type ContratacaoGi,
  type DadosGiParaPessoa,
  type PessoaParaGi,
  type VinculoEmpresaFilial,
} from "../domain/portal-dados-gi";

/**
 * O LEITOR do Portal→GI (peça 3): monta o `PessoaParaGi` de uma admissão juntando `candidatos` (o que
 * o EA já tinha) + `admissao_dados_gi` (o que o Portal coletou). É a camada de I/O; a JUNÇÃO em si é
 * a função pura `montarPessoaParaGi` (testável sem banco).
 *
 * DUAS PORTAS DE LEITURA, SEPARADAS DE PROPÓSITO (01/10/2026), e a separação é §A.6 aplicada:
 *   - `lerPessoa`      lê `candidatos` + `admissao_dados_gi`. **Não enxerga salário**, porque a consulta
 *                      não seleciona a coluna. Segue exatamente como era, sem uma linha de mudança.
 *   - `lerContratacao` lê `admissoes` + `dados_vaga_folha` + `cliente_vinculos`, os seis campos de
 *                      contratação autorizados pelo diretor, **coluna por coluna**.
 *
 * POR QUE DUAS PORTAS E NÃO UMA CONSULTA MAIS LARGA: a porta da pessoa fica PROVADAMENTE sem salário (a
 * coluna nem é trazida do banco), e a leitura do salário mora num método único, de nome explícito, fácil
 * de auditar. O custo é um round-trip a mais numa operação manual e um-a-um.
 *
 * ⚠️ NUNCA use `select()` largo aqui. Toda coluna é NOMEADA, inclusive em `lerContratacao`: um `select *`
 * em `dados_vaga_folha` traria junto benefícios, escala, centro de custo, departamento, setor, gestor BP,
 * motivo, uniforme, EPI e **o nome e o CPF da pessoa SUBSTITUÍDA**, nenhum deles autorizado a sair do EA
 * (minimização, §A.6; o CPF do substituído tem TTL próprio pela regra 10 do §A.3).
 *
 * §A.6: nada é logado aqui, em nenhuma das duas portas. O serviço não tem logger de propósito, então o
 * salário não tem por onde entrar num log nem numa mensagem de erro.
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
   * Os SEIS campos de CONTRATAÇÃO da admissão, já traduzidos para o vocabulário do GI. `null` quando a
   * admissão não existe.
   *
   * SÃO DUAS CONSULTAS, e a segunda depende da primeira: empresa e filial moram no VÍNCULO do cliente
   * (`cliente_vinculos`), resolvido por (`cod_cliente` + `tipo_servico`), e o tipo de serviço só se sabe
   * depois de ler o `tipo_contrato` da admissão. Os vínculos de um cliente são poucos (244 linhas no
   * total da base), então a segunda consulta traz os do cliente e a ESCOLHA é da função pura
   * `resolverEmpresaFilialGi`, onde ela fica testável.
   *
   * RECORTE EXPLÍCITO: de `dados_vaga_folha` sai **só o `salario`**. De `cliente_vinculos` saem só tipo,
   * empresa, filial e o `ativo`. `left join` na folha porque admissão sem folha existe.
   *
   * §A.6: o salário sai daqui dentro do objeto e NUNCA passa por log, nem aqui nem no chamador.
   */
  async lerContratacao(admissaoId: string): Promise<ContratacaoGi | null> {
    const [base] = await this.db
      .select({
        dataAdmissao: admissoes.dataAdmissao,
        tipoContrato: admissoes.tipoContrato,
        codCliente: admissoes.codCliente,
        salario: dadosVagaFolha.salario,
      })
      .from(admissoes)
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);

    if (!base) return null;

    // Sem cliente (pré-admissão do Pandapé nasce assim) não há vínculo a procurar: empresa e filial
    // ficam nulas e a guarda do envio recusa. Fail-closed, sem consulta inútil.
    const vinculos: VinculoEmpresaFilial[] = base.codCliente
      ? await this.db
          .select({
            tipoServico: clienteVinculos.tipoServico,
            empresaCodigo: clienteVinculos.empresaCodigo,
            filial: clienteVinculos.filial,
            ativo: clienteVinculos.ativo,
          })
          .from(clienteVinculos)
          .where(eq(clienteVinculos.codCliente, base.codCliente))
      : [];

    return montarContratacaoGi({
      salario: base.salario,
      dataAdmissao: base.dataAdmissao,
      tipoContrato: base.tipoContrato,
      vinculos,
    });
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
