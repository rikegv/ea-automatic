import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoDadosGi, admissoes, candidatos, clienteVinculos, dadosVagaFolha } from "../db/schema";
import {
  baseDoCodClienteComSufixo,
  baseNumericaDoCodCliente,
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
 *   - `lerContratacao` lê `admissoes` + `dados_vaga_folha` + `cliente_vinculos`, os sete campos de
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
/**
 * O estado da admissão que decide SE ela pode ser enviada ao G.I (nunca O QUE se envia). São as três
 * colunas de `admissoes` que as travas de envio leem, e só elas.
 */
export interface EstadoDaAdmissaoParaEnvioGi {
  /**
   * `admissoes.farol_global`. Entra em `admissaoEncerrada` (`DECLINOU`/`RESCISAO`), a guarda da cadeia
   * única. ⚠️ NÃO em `admissaoOperavel`, que exigiria farol VIVO e barraria `ADMISSAO_CONCLUIDA`.
   */
  farolGlobal: string | null;
  /** `admissoes.pausada_em`. Preenchido = pausada = não envia. */
  pausadaEm: Date | null;
  /** `admissoes.origem` (`MANUAL` / `PANDAPE`). Entra em `origemAutorizadaParaGi`. */
  origem: string | null;
}

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
          // A CIDADE de nascimento (0141). Campo SEPARADO da `naturalidade`, que é a SIGLA DA UF: no GI
          // são `cidadeNascimento` (30) e `naturalidade` (2), e o código IBGE do município sai desta
          // cidade + aquela UF, pelo de/para.
          cidadeNascimento: admissaoDadosGi.cidadeNascimento,
          filiacaoNomeMae: admissaoDadosGi.filiacaoNomeMae,
          filiacaoNomePai: admissaoDadosGi.filiacaoNomePai,
          estadoCivil: admissaoDadosGi.estadoCivil,
          raca: admissaoDadosGi.raca,
          grauInstrucao: admissaoDadosGi.grauInstrucao,
          rgNumero: admissaoDadosGi.rgNumero,
          rgOrgaoEmissor: admissaoDadosGi.rgOrgaoEmissor,
          rgUf: admissaoDadosGi.rgUf,
          rgCidade: admissaoDadosGi.rgCidade,
          rgDataEmissao: admissaoDadosGi.rgDataEmissao,
          ctpsNumero: admissaoDadosGi.ctpsNumero,
          ctpsSerie: admissaoDadosGi.ctpsSerie,
          ctpsUf: admissaoDadosGi.ctpsUf,
          ctpsCidade: admissaoDadosGi.ctpsCidade,
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
   * Os NOVE campos de CONTRATAÇÃO da admissão, já traduzidos para o vocabulário do GI. `null` quando a
   * admissão não existe. (Eram sete; a JORNADA entrou com a 0140, ver abaixo.)
   *
   * SÃO DUAS CONSULTAS, e a segunda depende da primeira: empresa e filial moram no VÍNCULO do cliente
   * (`cliente_vinculos`), resolvido por (`cod_cliente` + `tipo_servico`), e o tipo de serviço só se sabe
   * depois de ler o `tipo_contrato` da admissão. Os vínculos de um cliente são poucos (244 linhas no
   * total da base), então a segunda consulta traz os do cliente e a ESCOLHA é da função pura
   * `resolverEmpresaFilialGi`, onde ela fica testável.
   *
   * UMA TERCEIRA CONSULTA EXISTE, E SÓ PARA OS 7 `cod_cliente` COM SUFIXO DE CONTRATO (`51525-TEMP.`):
   * ela traz os vínculos dos IRMÃOS daquela base, que é o que autoriza o montador a tirar o sufixo na
   * saída sem fundir dois cadastros no GI. Código numérico não a dispara, então o caminho de sempre segue
   * com duas consultas. Ver `SUFIXO_DE_CONTRATO_NO_COD_CLIENTE` em `portal-dados-gi.ts`.
   *
   * RECORTE EXPLÍCITO: de `dados_vaga_folha` saem **só o `salario`, a UNIDADE dele e a JORNADA em
   * horas**. De `cliente_vinculos` saem só tipo, empresa, filial e o `ativo`. `left join` na folha porque
   * admissão sem folha existe.
   *
   * A UNIDADE (`salario_unidade`, 0140) NÃO É UM CAMPO A MAIS DE FOLHA: é o que torna o `salario`
   * LEGÍVEL. Sem ela o valor é ambíguo, e o `tipoSalario` do GI (`default 'M'`) desfaz a ambiguidade
   * pelo lado errado nas 7 admissões horistas medidas. Quem recusa é `recusaDaContratacaoGi`.
   *
   * A JORNADA (`jornada_horas_mes` / `jornada_horas_sem`, 0140) entra pelo mesmo motivo que a unidade: o
   * `tipoSalario = 'H'` do GI exige `qtdeHorasMes` e `qtdeHorasSem` do outro lado, os dois com
   * **`default 0`**, e sem elas o horista entraria na folha como "valor por hora vezes ZERO horas". É
   * jornada, não remuneração, e é o que transforma a recusa do horista em pendência PREENCHÍVEL em vez de
   * recusa perpétua (`GI_SALARIO_HORISTA_SEM_JORNADA`).
   *
   * OS CARIMBOS DA AUDITORIA (`salario_auditado_em` / `salario_auditado_por`) **não são lidos aqui, de
   * propósito**: são trilha INTERNA do EA e não têm campo correspondente no GI, então trazê-los seria
   * alargar a leitura sem nada do outro lado para recebê-los (minimização, §A.6). O que o envio precisa
   * saber é a UNIDADE; quem auditou é pergunta da tela e da trilha, não do fornecedor.
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
        salarioUnidade: dadosVagaFolha.salarioUnidade,
        jornadaHorasMes: dadosVagaFolha.jornadaHorasMes,
        jornadaHorasSem: dadosVagaFolha.jornadaHorasSem,
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

    // ── OS IRMÃOS DA BASE DO `cod_cliente`, e SÓ quando há SUFIXO DE CONTRATO ──────────────────────
    // O sufixo (`51525-TEMP.`) é regra de negócio do diretor e separa CONTRATOS do mesmo cliente dentro
    // do EA; ele é tirado só no montador do envio, porque o `codigoCliente` do GI é `int32`. Para provar
    // que tirá-lo não funde dois cadastros do outro lado, o montador precisa saber se a BASE já resolve
    // para outro cliente no MESMO par empresa/filial. É o que esta consulta responde, e nada mais.
    //
    // ⚠️ SÓ RODA PARA OS 7 CÓDIGOS COM SUFIXO: código numérico (244 dos 251 clientes) nem chega aqui, e
    // o caminho de sempre segue com DUAS consultas, como antes. As quatro colunas são as MESMAS do
    // vínculo (tipo, empresa, filial, ativo): nenhuma coluna nova, nada de pessoa, §A.6 preservada.
    //
    // O CASAMENTO DA BASE É EM TYPESCRIPT, por `baseNumericaDoCodCliente`, e não num `like`/regexp de
    // SQL: a régua do sufixo mora numa função só, testável sem banco. Um `like '51525-%'` seria uma
    // segunda cópia dela, e perderia variações (zero à esquerda) em silêncio, para o lado permissivo.
    const baseComSufixo = base.codCliente ? baseDoCodClienteComSufixo(base.codCliente) : null;
    const vinculosDeOutrosClientesDaMesmaBase: VinculoEmpresaFilial[] =
      baseComSufixo == null
        ? []
        : (
            await this.db
              .select({
                codCliente: clienteVinculos.codCliente,
                tipoServico: clienteVinculos.tipoServico,
                empresaCodigo: clienteVinculos.empresaCodigo,
                filial: clienteVinculos.filial,
                ativo: clienteVinculos.ativo,
              })
              .from(clienteVinculos)
          )
            .filter(
              (v) =>
                v.codCliente !== base.codCliente &&
                baseNumericaDoCodCliente(v.codCliente) === baseComSufixo,
            )
            .map(({ tipoServico, empresaCodigo, filial, ativo }) => ({
              tipoServico,
              empresaCodigo,
              filial,
              ativo,
            }));

    return montarContratacaoGi({
      salario: base.salario,
      salarioUnidade: base.salarioUnidade,
      jornadaHorasMes: base.jornadaHorasMes,
      jornadaHorasSem: base.jornadaHorasSem,
      dataAdmissao: base.dataAdmissao,
      tipoContrato: base.tipoContrato,
      vinculos,
      // O CLIENTE FINAL (`codigoCliente` do GI), REUSANDO o `cod_cliente` que esta consulta JÁ trazia
      // para achar o vínculo: nenhuma consulta nova. ⚠️ É o TOMADOR, não a empresa do grupo (essa sai de
      // `cliente_vinculos`, abaixo). De/para DIRETO, medido em 99% (`docs/MAPA-GI-CLIENTE-E-CIDADES.md`);
      // não numérico ou ausente resolve para nulo e o envio é RECUSADO, nunca `0`.
      codCliente: base.codCliente,
      // Os irmãos da base, para o montador decidir se pode tirar o sufixo. Vazio no caminho de sempre.
      vinculosDeOutrosClientesDaMesmaBase,
    });
  }

  /**
   * O ESTADO DA ADMISSÃO que as DUAS travas de envio consomem, e **nada além disso**: o farol, a pausa
   * e a ORIGEM. Três colunas de `admissoes`, nomeadas uma a uma. `null` quando a admissão não existe.
   *
   * POR QUE ELA EXISTE, e por que é uma porta separada das outras duas: o gatilho AUTOMÁTICO recebia
   * farol e pausa do CHAMADOR (quem fechou a auditoria tem a admissão carregada), e o botão MANUAL não
   * recebia nada, nem ninguém lia a `origem` em lugar algum do caminho do GI. Com a guarda de
   * ENCERRAMENTO dentro de `enviarComGuardas` (o ponto por onde os dois gatilhos passam, decisão do
   * diretor: declinado e rescindido não saem por caminho nenhum, nem por SUPER_ADMIN) e com a trava de
   * ORIGEM no automático, o serviço passou a precisar ler o estado por conta própria, para nenhum
   * caminho futuro contornar as guardas por simplesmente não passar contexto.
   *
   * ESTA LEITURA É A AUTORITATIVA das duas travas de estado. O que o `enviar()` recebe pelo contexto é
   * curto-circuito barato (recusa sem tocar o banco), não a palavra final.
   *
   * ⚠️ NÃO É UMA CONSULTA A MAIS NA LEITURA DE CONTRATAÇÃO, de propósito. `lerContratacao` devolve
   * `ContratacaoGi`, que é a allowlist FECHADA dos campos de contratação que atravessam para o
   * fornecedor; farol, pausa e origem são estado INTERNO do EA e não têm campo do outro lado. Enfiá-los
   * ali afrouxaria aquela contagem fechada e misturaria "o que se envia" com "se se envia".
   *
   * §A.6: NENHUMA coluna de pessoa é selecionada aqui. Nada é logado.
   */
  async lerEstado(admissaoId: string): Promise<EstadoDaAdmissaoParaEnvioGi | null> {
    const [linha] = await this.db
      .select({
        farolGlobal: admissoes.farolGlobal,
        pausadaEm: admissoes.pausadaEm,
        origem: admissoes.origem,
      })
      .from(admissoes)
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    return linha ?? null;
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
