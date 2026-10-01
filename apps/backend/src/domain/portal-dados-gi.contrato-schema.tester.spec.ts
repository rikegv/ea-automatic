import { describe, expect, it } from "vitest";
import {
  montarFuncionarioSelecao,
  type DeParaGi,
  type FuncionarioSelecao,
  type PessoaParaGi,
} from "./portal-dados-gi";

/**
 * CONTRATO DE SCHEMA: `montarFuncionarioSelecao` x `TB_FuncionarioSelecaoAPI` do GI.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40), NÃO a partir do código. Vários destes
 * testes FALHAM hoje de propósito: eles são a régua do que o produto precisa passar a fazer, e cada
 * um carrega, no comentário, o conserto exigido. Quem consertar o montador faz o teste passar.
 *
 * FONTE DO CONTRATO: `https://apigeral.gi.app.br/openapi/v1.json` (OpenAPI 3.1.1), schema
 * `TB_FuncionarioSelecaoAPI`, 415 propriedades, nenhuma `required`. Baixado em 01/10/2026.
 * O recorte abaixo é CÓPIA LOCAL, colada do contrato: este teste NUNCA vai à rede.
 *
 * §A.6: toda entrada é SINTÉTICA. CPF de faixa reservada (999/099), nomes inventados, nenhum dado
 * de pessoa real, nenhum valor impresso em mensagem de falha que não seja o próprio sintético.
 */

// ── O recorte do contrato (cópia local, não vai à rede) ──────────────────────────────────────────

/** Os 415 nomes de propriedade de `TB_FuncionarioSelecaoAPI`, copiados do contrato. */
const NOMES_DO_SCHEMA: readonly string[] = [
  "acum_SaldoNeg", "acum_Troco", "agencia", "agenciaFGTS", "agenciaReembolso", "aliqPensao13o",
  "aliqPensaoFer", "alqAbonoLider", "anoChegada", "anoMesTransferencia", "apiSinc",
  "apiSincAdmissaoDigital", "apiSincExterno", "atividadeCurso", "avaliacaoComportamento", "bairroResid",
  "basePensao13o", "basePensaoFer", "calculaAnuenio", "calculaBienio", "calculaGratificacao", "calculaINSS",
  "calculaIRF", "calculaQuadrienio", "calculaQuinquenio", "calculaTrienio", "campoLivre_01",
  "campoLivre_02", "campoLivre_03", "campoLivre_04", "campoLivre_05", "campoLivre_06", "campoLivre_07",
  "campoLivre_08", "campoLivre_09", "campoLivre_10", "cartaApresentacao", "cartaoMetroCard", "cartaoPonto",
  "cartaoPrePago", "cartaoSUS", "carteiraTrabalho", "casadoBrasileiro", "centroCustoContab", "cepResid",
  "certificadoSeguranca", "chapa", "chapera", "chaveGRRF", "chavePixFun", "cidadeExpedicao",
  "cidadeNascimento", "cidadeRG", "cidadeResid", "classTrabEstrang", "classeContrib", "cnH_DataRevisao",
  "cnH_Modelo", "cnH_Obs", "cnH_Pontuacao", "cnHorgaoemissor", "cnhDataEmissao", "cnpjEmpresaAnterior",
  "cnpjLabExameTox", "codCateg_eSocial", "codCom1", "codCom2", "codConv", "codMunicipioNascto",
  "codigoAfastamento", "codigoBcoFolha", "codigoBcoPagar", "codigoBcoReembolso", "codigoCR",
  "codigoCentroCusto", "codigoCidadeResid", "codigoCliente", "codigoContrato", "codigoCoordenador",
  "codigoCurso", "codigoDepto", "codigoEmpresa", "codigoEmpresaOrigem", "codigoEmpresaSubstituto",
  "codigoEmpresaSubstituto2", "codigoEmpresaSubstituto3", "codigoEmpresaSubstituto4",
  "codigoEmpresaSubstituto5", "codigoExameTox", "codigoFilial", "codigoFilialOrigem",
  "codigoFilialSubstituto", "codigoFilialSubstituto2", "codigoFilialSubstituto3", "codigoFilialSubstituto4",
  "codigoFilialSubstituto5", "codigoFuncao", "codigoFuncao2", "codigoFuncao3", "codigoFuncao4",
  "codigoFuncao5", "codigoFuncionario", "codigoFuncionarioOrigem", "codigoFuncionarioSubstituto",
  "codigoFuncionarioSubstituto2", "codigoFuncionarioSubstituto3", "codigoFuncionarioSubstituto4",
  "codigoFuncionarioSubstituto5", "codigoFuncionarioWEB", "codigoHorario", "codigoInstituicao",
  "codigoRecrutador", "codigoRepresentante", "codigoRescisao", "codigoSelecionador", "codigoSindicato",
  "codigoSupervisor", "codigoUsuarioWeb", "codigoVendedor", "contaCorrente", "contaCorrenteReembolso",
  "contaFGTS", "cpf", "cpfAnt", "cpfSubstituto", "cpfSubstituto2", "cpfSubstituto3", "cpfSubstituto4",
  "cpfSubstituto5", "cpfTitularConta", "cplEndereco", "cptFGTS", "ctpsDigital", "curso_DataUltMatricula",
  "curso_DataVcto", "curso_DiasVcto", "curso_UltMatricula", "dataAcordoBem", "dataAdmissao",
  "dataCadastroPIS", "dataDemissao", "dataDemissaoAgenda", "dataExameTox", "dataFimFeriasProg",
  "dataFimFeriasProg2", "dataFimFeriasProg3", "dataImpGRRF", "dataInclusao", "dataIniEdicaoPortal",
  "dataIniFeriasProg", "dataIniFeriasProg2", "dataIniFeriasProg3", "dataLimiteBNF", "dataLimitePagto",
  "dataNascimento", "dataOpcaoFGTS", "dataPrevPgtoGRRF", "dataUltAtuTurnovo", "dataUltimoExame",
  "dataVectoExame", "dataVectoHabilitacao", "dataVigenciaBnf", "dataalteracao", "deficienteFisico",
  "depIRF", "depSF", "descSalVariavel", "descontaCA", "descontaCC", "descontaCS", "descontaMS",
  "descontaTA", "diaAdto", "diaPgto", "diasContrato", "diasProrrogacao", "diasVectoExame", "dtAltCPF",
  "dtExpedicaoCTPS", "dtExpedicaoRG", "dtExpedicaoReservista", "dtIniEdicaoPortal",
  "dtNascimentoTitularConta", "dtNaturalizacao", "dtPriHab", "dtVectoContrato", "dtVectoProrrogacao",
  "eSocialMatricula", "eSocialQualifCad", "email", "emailGestor", "emissaoEtiqueta", "emissaoFichaHora",
  "enderecoResid", "escalaDataFim", "escalaDataInicio", "escalaDiasDescanso", "escalaDiasTrabalho",
  "escalaTipo", "estadoCivil", "eventoPensao13o", "eventoPensaoFer", "exterior_bairro",
  "exterior_codPostal", "exterior_complemento", "exterior_descLogradouro", "exterior_nomeCidade",
  "exterior_nrLogradouro", "exterior_paisResidencia", "filhosBrasileiros", "filiacaoNomeMae",
  "filiacaoNomePai", "filtroUsuariosWeb", "flagAposentado", "flagIndicacao", "flagRecontratacao",
  "flagSelecao", "flagViajante", "foto", "frmTribut", "grauInstrucao", "grupoGPSCodigoCC", "habilitacao",
  "iD_GiSelecao", "idAdmDigital", "idClienteWeb", "idFatPedido", "idGrupoGPS", "idRegistroWeb",
  "idSistemaAnterior", "idUsuarioGI", "idVaga", "inclusaoOK", "indAdmissao", "indMV", "indNIF", "indProvim",
  "infoCota", "jamFGTS", "justificativaProrrogacao", "localTrabalho", "matricAnt", "matricula",
  "mesesDuracaoBem", "motivoContrato", "motivoProrrogacao", "motivoSubstituicao", "motivoSubstituicao2",
  "motivoSubstituicao3", "motivoSubstituicao4", "motivoSubstituicao5", "motivoSubstituicao6",
  "motorista_DataVectoMOOP", "motorista_MOOP", "nacionalidade", "natAtividade", "naturalidade", "nifBenef",
  "nivelCurso", "nmSoc", "nome", "nomeCurso", "nomeSubstituto", "nomeSubstituto2", "nomeSubstituto3",
  "nomeSubstituto4", "nomeSubstituto5", "nomeTitularConta", "novoBnf", "nrCRMExameTox",
  "nrProcJudAlvaraJudicial", "nroCartaoBHBus", "nroCartaoGuaruPas", "nroCartaoOtimo", "nroCartaoRioCard",
  "nroCartaoSPTrans", "nroCartaoSodexhoRH", "nroCartaoTransBetim", "nroCartaoTransURB", "nroCartaoURBS",
  "nroCartaoVTC", "nroCarteiraBnfAM", "nroCarteiraBnfAO", "nroEndereco", "nroReqPed", "oCnr", "objDet",
  "obsAltCPF", "obsCtpseSocial", "obsFaturamento", "obsGIAdmDigital", "obsRecrutador", "obsWeb",
  "observacao", "ocDataEmissao", "ocDataValidade", "ocorgaoemissor", "ocorrenciaFGTS", "orgaoRG",
  "percentFatu", "percentFatu2", "percentFatu3", "percentInsalub", "percentPericul", "percentRedCargHorBem",
  "percentualVT", "pis", "portadorCheque", "primeiroEmprego", "progFer_1P13o", "progFer_Abono",
  "qtdeAnuenio", "qtdeBnfInformado", "qtdeHorasMes", "qtdeHorasSem", "raca", "reabReadap", "recebendoSD",
  "regiao", "reservista", "residenciaPropria", "residenciarecursoFGTS", "rg", "riCnr", "riCorgaoemissor",
  "ricDataEmissao", "rnEnr", "rnEorgaoemissor", "rneDataEmissao", "rneDataVecto", "saP_Area", "saP_Id",
  "salario", "salarioFat", "salarioFat2", "salarioHora", "salarioMesGarantido", "saldoFGTS",
  "senhaCaixinha", "serie", "sexo", "situacao", "smsNroCel", "smsdddCel", "statusGIAdmDigital",
  "statusGIPandaPe", "statusGrupoGPS", "statusPreCadastro", "statusgiselecty", "taxaAdt", "taxaCom1",
  "taxaCom2", "taxaRecrutador", "taxaRepresentante", "taxaSelecionador", "taxaVendedor", "teleTrabalho",
  "telefoneResid", "tipo13o", "tipoAdesaoBem", "tipoAdmSIRETT", "tipoAdmissao", "tipoChavePixFun",
  "tipoContrato", "tipoContratoWeb", "tipoDeficiencia", "tipoDemissao", "tipoEndereco", "tipoFat",
  "tipoFatu", "tipoFer", "tipoMskBanco", "tipoMskBancoReembolso", "tipoOperacaoWeb", "tipoPgto",
  "tipoSalario", "tipoVR", "tipoVT", "tipoVctoContrato", "tipoVctoContratoProrr", "titEleSecao",
  "titEleZona", "tituloEleitor", "tpAdmissao", "tpJornada", "tpRegimeJor", "tpRegimePrev", "tpRegimeTrab",
  "trabalhoIntermitente", "trabalhoParcial", "transLitoral", "transferenciaOnus", "ufCnh", "ufExpedicao",
  "ufResid", "ufcrmExameTox", "ufrg", "usuarioInclusao", "vA_Diario", "valHoraFatReqPed", "valorAdcNotFat",
  "valorAdcNotFat2", "valorAdtoFixo", "valorFaltaDiaFat", "valorFaltaDiaFat2", "valorFixo01", "valorFixo02",
  "valorFixo03", "valorFixo04", "valorFixo05", "valorHorExtFat", "valorHorExtFat2",
  "valorUltimoBnfInformado", "vinculo", "vlrSalVariavel",
];

/** O tipo de uma propriedade do schema, no recorte que importa para a validação. */
interface PropriedadeDoSchema {
  type: string[];
  maxLength?: number;
  pattern?: string;
  format?: string;
  default?: unknown;
}

/**
 * O recorte DETALHADO: só as propriedades que `montarFuncionarioSelecao` emite hoje. Colado do
 * contrato sem edição (inclusive as `description` foram descartadas por volume, não por conteúdo).
 */
const SCHEMA: Record<string, PropriedadeDoSchema> = {
    "agencia": {
      "default": "",
      "maxLength": 10,
      "type": [
        "null",
        "string"
      ]
    },
    "bairroResid": {
      "default": "",
      "maxLength": 60,
      "type": [
        "null",
        "string"
      ]
    },
    "carteiraTrabalho": {
      "default": "00000000",
      "maxLength": 10,
      "type": [
        "null",
        "string"
      ]
    },
    "cepResid": {
      "default": "00000-000",
      "maxLength": 9,
      "type": [
        "null",
        "string"
      ]
    },
    "cidadeResid": {
      "default": "",
      "maxLength": 60,
      "type": [
        "null",
        "string"
      ]
    },
    "cnhDataEmissao": {
      "format": "date-time",
      "type": [
        "null",
        "string"
      ]
    },
    "codigoBcoFolha": {
      "default": 0,
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "codigoBcoPagar": {
      "default": 0,
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "codigoCidadeResid": {
      "default": 0,
      "format": "int32",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "contaCorrente": {
      "default": "",
      "maxLength": 20,
      "type": [
        "null",
        "string"
      ]
    },
    "cpf": {
      "default": 0,
      "format": "double",
      "pattern": "^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$",
      "type": [
        "null",
        "number",
        "string"
      ]
    },
    "cplEndereco": {
      "default": "",
      "maxLength": 30,
      "type": [
        "null",
        "string"
      ]
    },
    "dataNascimento": {
      "format": "date-time",
      "type": [
        "null",
        "string"
      ]
    },
    "dataVectoHabilitacao": {
      "format": "date-time",
      "type": [
        "null",
        "string"
      ]
    },
    "dtExpedicaoCTPS": {
      "format": "date-time",
      "type": [
        "null",
        "string"
      ]
    },
    "dtExpedicaoRG": {
      "format": "date-time",
      "type": [
        "null",
        "string"
      ]
    },
    "email": {
      "default": "",
      "maxLength": 50,
      "type": [
        "null",
        "string"
      ]
    },
    "enderecoResid": {
      "default": "",
      "maxLength": 70,
      "type": [
        "null",
        "string"
      ]
    },
    "estadoCivil": {
      "default": "S",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    },
    "filiacaoNomeMae": {
      "default": "",
      "maxLength": 70,
      "type": [
        "null",
        "string"
      ]
    },
    "filiacaoNomePai": {
      "default": "",
      "maxLength": 70,
      "type": [
        "null",
        "string"
      ]
    },
    "grauInstrucao": {
      "default": "4",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    },
    "habilitacao": {
      "default": "",
      "maxLength": 40,
      "type": [
        "null",
        "string"
      ]
    },
    "nacionalidade": {
      "default": "010",
      "maxLength": 3,
      "type": [
        "null",
        "string"
      ]
    },
    "naturalidade": {
      "default": "",
      "maxLength": 2,
      "type": [
        "null",
        "string"
      ]
    },
    "nome": {
      "default": "",
      "maxLength": 60,
      "type": [
        "null",
        "string"
      ]
    },
    "nroEndereco": {
      "default": 0,
      "format": "int32",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "integer",
        "string"
      ]
    },
    "orgaoRG": {
      "default": "",
      "maxLength": 15,
      "type": [
        "null",
        "string"
      ]
    },
    "pis": {
      "default": 0,
      "format": "double",
      "pattern": "^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$",
      "type": [
        "null",
        "number",
        "string"
      ]
    },
    "raca": {
      "default": "",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    },
    "reservista": {
      "default": "",
      "maxLength": 40,
      "type": [
        "null",
        "string"
      ]
    },
    "rg": {
      "default": "",
      "maxLength": 20,
      "type": [
        "null",
        "string"
      ]
    },
    "serie": {
      "default": "00000",
      "maxLength": 7,
      "type": [
        "null",
        "string"
      ]
    },
    "sexo": {
      "default": "",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    },
    "smsNroCel": {
      "default": 0,
      "format": "double",
      "pattern": "^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$",
      "type": [
        "null",
        "number",
        "string"
      ]
    },
    "smsdddCel": {
      "default": 0,
      "format": "uint8",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "titEleSecao": {
      "default": 0,
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "titEleZona": {
      "default": 0,
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    "tituloEleitor": {
      "default": "",
      "maxLength": 40,
      "type": [
        "null",
        "string"
      ]
    },
    "ufExpedicao": {
      "default": "",
      "maxLength": 2,
      "type": [
        "null",
        "string"
      ]
    },
    "ufResid": {
      "default": "",
      "maxLength": 2,
      "type": [
        "null",
        "string"
      ]
    },
    "ufrg": {
      "default": "",
      "maxLength": 2,
      "type": [
        "null",
        "string"
      ]
    }
  };

// ── Entradas sintéticas ─────────────────────────────────────────────────────────────────────────

/** Nada aqui existe: CPF da faixa reservada 999, nomes inventados, domínio de homologação. */
const PESSOA_MINIMA: PessoaParaGi = {
  nome: "Zarolina Trevisanto Quembe",
  cpf: "99988877766",
  email: "zarolina@homolog.local",
};

/** Um valor de texto bem maior que qualquer `maxLength` do contrato (80 caracteres). */
const TEXTO_LONGO = "Z".repeat(80);

const DE_PARA_COM_ZERO_A_ESQUERDA: DeParaGi = {
  // 3550308 é São Paulo; um município de código curto do IBGE sai com zero à esquerda no cadastro
  // antigo do GI, e é esse o caso que interessa.
  codigoCidade: () => "0350",
  // 001 é o Banco do Brasil, o código de banco mais comum do país.
  codigoBanco: () => "001",
};

/** Lê uma chave da saída sem `any`, para as varreduras genéricas. */
function valorDe(f: FuncionarioSelecao, chave: string): unknown {
  return (f as unknown as Record<string, unknown>)[chave];
}

/** As propriedades de texto do recorte que têm `maxLength` (as que o GI mede e recusa com 400). */
const CAMPOS_COM_MAXLENGTH = Object.entries(SCHEMA)
  .filter(([, p]) => typeof p.maxLength === "number")
  .map(([nome, p]) => ({ nome, maxLength: p.maxLength as number }));

/** As propriedades numéricas do recorte (as que têm `pattern`). */
const CAMPOS_COM_PATTERN = Object.entries(SCHEMA)
  .filter(([, p]) => typeof p.pattern === "string")
  .map(([nome, p]) => ({ nome, pattern: p.pattern as string }));

/**
 * Os campos de CÓDIGO curto (`maxLength` de 1 a 3). Cortar um destes INVENTA um código: "Brasileira"
 * virando "Bra" não é truncamento, é outro valor. `sexo` entra na lista e já está correto hoje
 * (`mapearSexo` devolve nulo quando não reconhece): ele é o PRECEDENTE do comportamento exigido.
 */
const CAMPOS_DE_CODIGO_CURTO = CAMPOS_COM_MAXLENGTH.filter((c) => c.maxLength <= 3).map((c) => c.nome);

// ── PONTO 1: nenhuma chave fora das 415 ─────────────────────────────────────────────────────────

/*
 * NOTA DO COORDENADOR (01/10/2026), ATUALIZADA no mesmo dia, depois do conserto autorizado.
 *
 * A régua nasceu com SETE testes marcados `it.fails`: o produto ainda não fazia o que o contrato
 * pede, e o marcador AFIRMA a falha, de modo que o dia da correção o vira VERMELHO e obriga quem
 * corrigiu a trocar `it.fails` por `it` (ao contrário de um `skip`, que apodrece em silêncio).
 * Funcionou exatamente assim.
 *
 * ESTADO AGORA, e ele é PARCIAL de propósito: o diretor autorizou DUAS das regras, e elas estão
 * CUMPRIDAS pelo produto, com os três testes correspondentes já como `it` normal:
 *   - ponto 2, TAMANHO: todo campo de texto é cortado no `maxLength` (`cortarTexto`);
 *   - ponto 4, CÓDIGO CURTO: não cabendo, vira NULO, nunca cortado (`codigoCurto`).
 *
 * SEGUEM `it.fails` os QUATRO testes do ponto 3 (pattern numérico, zero à esquerda PROIBIDO):
 * `cpf`/`pis` iniciados em zero, DDD `01`, zona/seção `007` e código de banco `001`. A normalização
 * numérica NÃO foi autorizada nesta rodada, então a régua continua apontada e o marcador continua de
 * pé, esperando o aval do diretor (§A.31: propõe, não constrói).
 */

describe("ponto 1: toda chave emitida existe em TB_FuncionarioSelecaoAPI", () => {
  it("o recorte local tem as 415 propriedades do contrato", () => {
    expect(NOMES_DO_SCHEMA).toHaveLength(415);
    expect(new Set(NOMES_DO_SCHEMA).size).toBe(415);
  });

  it("nenhuma chave do payload esta fora do schema", () => {
    const f = montarFuncionarioSelecao(PESSOA_MINIMA, DE_PARA_COM_ZERO_A_ESQUERDA);
    const conhecidas = new Set(NOMES_DO_SCHEMA);
    const forasteiras = Object.keys(f).filter((k) => !conhecidas.has(k));
    expect(forasteiras).toEqual([]);
  });

  it("o recorte detalhado cobre exatamente as chaves que o montador emite", () => {
    // Guarda do próprio teste: campo novo no montador sem entrada no recorte passaria batido nas
    // varreduras dos pontos 2, 3 e 4, e o teste viraria decorativo.
    const f = montarFuncionarioSelecao(PESSOA_MINIMA);
    expect(Object.keys(f).sort()).toEqual(Object.keys(SCHEMA).sort());
  });
});

// ── PONTO 5: nomeBanco / bancoNome não existem no envio ─────────────────────────────────────────

describe("ponto 5: nomeBanco e bancoNome NAO pertencem a TB_FuncionarioSelecaoAPI", () => {
  it("os dois nomes estao ausentes do contrato", () => {
    expect(NOMES_DO_SCHEMA).not.toContain("nomeBanco");
    expect(NOMES_DO_SCHEMA).not.toContain("bancoNome");
  });

  it("o montador nao emite nenhum dos dois, nem com banco preenchido", () => {
    const f = montarFuncionarioSelecao(
      { ...PESSOA_MINIMA, banco: "Banco do Brasil" },
      DE_PARA_COM_ZERO_A_ESQUERDA,
    );
    expect(f).not.toHaveProperty("nomeBanco");
    expect(f).not.toHaveProperty("bancoNome");
  });

  it("o banco atravessa SO por codigo (`Bco`), nunca por nome", () => {
    const f = montarFuncionarioSelecao({ ...PESSOA_MINIMA, banco: "Banco do Brasil" });
    // Nenhuma chave com "banco" por extenso: no contrato o banco da pessoa entra por CÓDIGO, e as
    // únicas propriedades com "Banco" no nome (`tipoMskBanco`, `tipoMskBancoReembolso`) são máscara
    // de impressão, não o banco. O nome do banco vive só em `TB_Banco`, outro schema.
    expect(Object.keys(f).filter((k) => /banco/i.test(k))).toEqual([]);
    expect(Object.keys(f).filter((k) => /bco/i.test(k)).sort()).toEqual([
      "codigoBcoFolha",
      "codigoBcoPagar",
    ]);
  });
});

// ── PONTO 2: maxLength respeitado em todo campo de texto ───────────────────────────────────────

describe("ponto 2: todo campo de texto respeita o maxLength do contrato", () => {
  /**
   * CUMPRIDO em 01/10/2026 (autorizado pelo diretor): `cortarTexto(valor, maxLength)` é aplicado em
   * TODOS os campos de texto com `maxLength`, e não só em `cplEndereco`. Antes 26 campos saíam
   * inteiros e o GI recusava o ENVIO TODO com HTTP 400 (medido em 29/09:
   * `"Naturalidade": ["Máximo 2 caracteres"]`). Perder o final do texto é melhor que perder a
   * admissão; nos campos de CÓDIGO o conserto é outro, ver ponto 4.
   */
  it("nenhum campo de texto excede o maxLength", () => {
    const pessoaGorda: PessoaParaGi = {
      nome: TEXTO_LONGO,
      email: TEXTO_LONGO,
      nomeMae: TEXTO_LONGO,
      nomePai: TEXTO_LONGO,
      rg: TEXTO_LONGO,
      rgOrgao: TEXTO_LONGO,
      ctpsNumero: TEXTO_LONGO,
      ctpsSerie: TEXTO_LONGO,
      tituloNumero: TEXTO_LONGO,
      reservista: TEXTO_LONGO,
      cnh: TEXTO_LONGO,
      cep: TEXTO_LONGO,
      logradouro: TEXTO_LONGO,
      complemento: TEXTO_LONGO,
      bairro: TEXTO_LONGO,
      cidade: TEXTO_LONGO,
      agencia: TEXTO_LONGO,
      conta: TEXTO_LONGO,
    };
    const f = montarFuncionarioSelecao(pessoaGorda);
    const estouros = CAMPOS_COM_MAXLENGTH.filter(({ nome, maxLength }) => {
      const v = valorDe(f, nome);
      return typeof v === "string" && v.length > maxLength;
    }).map(({ nome, maxLength }) => `${nome} (max ${maxLength})`);
    expect(estouros).toEqual([]);
  });

  it("cplEndereco corta em 30 (o precedente que os demais campos de texto agora seguem)", () => {
    const f = montarFuncionarioSelecao({ complemento: TEXTO_LONGO });
    expect(f.cplEndereco).toHaveLength(30);
  });

  it("o CEP cabe nos 9 caracteres do contrato", () => {
    // CONSERTO EXIGIDO: cortar (ou normalizar) `cepResid` em 9. "01310-100" cabe; texto maior, não.
    const f = montarFuncionarioSelecao({ cep: "01310-100 apto 42" });
    expect((f.cepResid ?? "").length).toBeLessThanOrEqual(9);
  });
});

// ── PONTO 3: pattern numérico, sem zero à esquerda ─────────────────────────────────────────────

describe("ponto 3: todo campo numerico respeita o pattern (zero a esquerda PROIBIDO)", () => {
  /**
   * CONSERTO EXIGIDO: normalizar os 9 campos numéricos antes de emitir, tirando o zero à esquerda
   * (ou emitindo número em vez de string). Hoje o EA manda a string crua: CPF iniciado em zero,
   * PIS iniciado em zero, zona/seção "007" e código de banco "001" violam o padrão do contrato.
   * Valor sem dígito nenhum deve virar NULO, nunca string inválida.
   */
  it.fails("FALHA HOJE: nenhum campo numerico sai com zero a esquerda", () => {
    const f = montarFuncionarioSelecao(
      {
        ...PESSOA_MINIMA,
        // CPF sintético da faixa reservada 099, iniciado em zero: é o caso que quebra.
        cpf: "09988877766",
        pis: "01234567890",
        tituloZona: "007",
        tituloSecao: "0042",
        telefone: "011999887766",
      },
      DE_PARA_COM_ZERO_A_ESQUERDA,
    );
    const violacoes = CAMPOS_COM_PATTERN.filter(({ nome, pattern }) => {
      const v = valorDe(f, nome);
      if (v == null) return false;
      return !new RegExp(pattern).test(String(v));
    }).map(({ nome }) => `${nome}=${String(valorDe(f, nome))}`);
    expect(violacoes).toEqual([]);
  });

  it.fails("FALHA HOJE: o CPF iniciado em zero sai sem o zero a esquerda", () => {
    // CONSERTO EXIGIDO: `cpf` é `double` no GI; "09988877766" viola o pattern e recusa o envio.
    const f = montarFuncionarioSelecao({ cpf: "099.888.777-66" });
    expect(f.cpf).toBe("9988877766");
  });

  it.fails("FALHA HOJE: o DDD de telefone com zero inicial nao sai como `01`", () => {
    // CONSERTO EXIGIDO: `smsdddCel` é `uint8` com pattern; "01" viola o padrão E está errado como
    // DDD (o zero é prefixo de operadora, não parte do DDD). O esperado é "11".
    const f = montarFuncionarioSelecao({ telefone: "011999887766" });
    expect(f.smsdddCel).toBe("11");
  });

  it.fails("FALHA HOJE: codigo de banco 001 sai normalizado para 1", () => {
    // CONSERTO EXIGIDO: `codigoBcoFolha`/`codigoBcoPagar` são `int16` com pattern. O de/para pode
    // devolver o código do catálogo com zero à esquerda; normalizar é do montador.
    const f = montarFuncionarioSelecao(
      { ...PESSOA_MINIMA, banco: "Banco do Brasil" },
      DE_PARA_COM_ZERO_A_ESQUERDA,
    );
    expect(f.codigoBcoFolha).toBe("1");
    expect(f.codigoBcoPagar).toBe("1");
  });

  it("campo numerico ausente continua NULO (nunca string vazia)", () => {
    const f = montarFuncionarioSelecao({ nome: "Zarolina Trevisanto Quembe" });
    for (const { nome } of CAMPOS_COM_PATTERN) {
      const v = valorDe(f, nome);
      // `nroEndereco` é o único não-anulável do grupo: o contrato manda 0, não nulo.
      if (nome === "nroEndereco") {
        expect(v).toBe(0);
        continue;
      }
      expect(v == null || String(v).length > 0).toBe(true);
    }
  });
});

// ── PONTO 4: campo de código curto é NULO quando não couber, nunca cortado ─────────────────────

describe("ponto 4: codigo curto (maxLength 1 a 3) vira NULO quando nao couber, nunca cortado", () => {
  /**
   * CUMPRIDO em 01/10/2026 (autorizado pelo diretor): `sexo`, `estadoCivil`, `raca`, `grauInstrucao`,
   * `naturalidade`, `nacionalidade`, `ufrg`, `ufExpedicao` e `ufResid` saem SÓ quando já cabem no
   * tamanho do contrato; não cabendo, saem NULOS (`codigoCurto`). Cortar "Brasileira" em "Bra" ou
   * "Casado" em "C" INVENTARIA um código que o GI leria como outra coisa, e isso é pior que campo
   * vazio. O precedente é o `mapearSexo` do mesmo arquivo, que devolve nulo quando não reconhece.
   *
   * ⚠️ Isto trava o DANO, não entrega a funcionalidade: sem de/para de catálogo (não autorizado nesta
   * rodada), os cinco campos coletados como texto livre seguem chegando NULOS ao GI.
   */
  it("os 9 campos de codigo curto sao exatamente os esperados", () => {
    expect(CAMPOS_DE_CODIGO_CURTO.sort()).toEqual(
      [
        "estadoCivil",
        "grauInstrucao",
        "naturalidade",
        "nacionalidade",
        "raca",
        "sexo",
        "ufExpedicao",
        "ufResid",
        "ufrg",
      ].sort(),
    );
  });

  it("texto por extenso em campo de codigo vira NULO, nao um codigo inventado", () => {
    const f = montarFuncionarioSelecao({
      sexo: "Prefere nao declarar",
      estadoCivil: "Casado",
      raca: "Parda",
      grauInstrucao: "Ensino Medio Completo",
      naturalidade: "Sao Paulo",
      nacionalidade: "Brasileira",
      rgUf: "Sao Paulo",
      ctpsUf: "Sao Paulo",
      uf: "Sao Paulo",
    });
    const inventados = CAMPOS_DE_CODIGO_CURTO.filter((nome) => valorDe(f, nome) !== null).map(
      (nome) => `${nome}=${String(valorDe(f, nome))}`,
    );
    expect(inventados).toEqual([]);
  });

  it("sexo JA se comporta assim (o precedente): texto desconhecido vira nulo", () => {
    expect(montarFuncionarioSelecao({ sexo: "Prefere nao declarar" }).sexo).toBeNull();
    expect(montarFuncionarioSelecao({ sexo: "MASCULINO" }).sexo).toBe("M");
    expect(montarFuncionarioSelecao({ sexo: "FEMININO" }).sexo).toBe("F");
  });

  it("codigo curto que JA cabe atravessa intacto", () => {
    const f = montarFuncionarioSelecao({
      estadoCivil: "S",
      raca: "4",
      grauInstrucao: "7",
      naturalidade: "SP",
      nacionalidade: "010",
      rgUf: "SP",
      ctpsUf: "SP",
      uf: "SP",
    });
    expect(f.estadoCivil).toBe("S");
    expect(f.raca).toBe("4");
    expect(f.grauInstrucao).toBe("7");
    expect(f.naturalidade).toBe("SP");
    expect(f.nacionalidade).toBe("010");
    expect(f.ufrg).toBe("SP");
    expect(f.ufExpedicao).toBe("SP");
    expect(f.ufResid).toBe("SP");
  });
});
