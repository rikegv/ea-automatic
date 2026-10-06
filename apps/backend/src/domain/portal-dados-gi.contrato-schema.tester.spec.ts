import { describe, expect, it } from "vitest";
import {
  DE_PARA_GI_VAZIO,
  mapearVinculoGi,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  prazoContratoGi,
  type ContratacaoGi,
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
    // ACRESCENTADO em 06/10/2026, colado do contrato real do fornecedor
    // (https://apigeral.gi.app.br/openapi/v1.json, relido nesta data). Decide se a pre-admissao fica
    // ESPERANDO no GI ou e consumida por ele em menos de 10 minutos: medido em producao, com `false`
    // o registro some, com `true` permanece. A chave sai SEMPRE, nunca omitida.
    // A `description` do contrato real, que o tipo `PropriedadeDoSchema` nao modela, e:
    // "true - Sincroniza com Admissao Digital, false - Sincroniza com GI".
    "apiSincAdmissaoDigital": {
      "default": false,
      "type": [
        "boolean"
      ]
    },
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
    // ── AS TRÊS CIDADES (0141): TEXTO LIVRE de 30, as três ANULÁVEIS e com default "" ────────────
    // Colado do contrato em 02/10/2026. As três são `["null","string"]` com `maxLength` 30, ou seja
    // TEXTO, e não código de tabela fechada: é o que obriga o montador a usar `cortarTexto` (trunca) e
    // NUNCA `codigoCurto` (anula). Ver a régua em `gi/gi-cliente-e-cidades.tester.spec.ts`.
    "cidadeExpedicao": {
      "default": "",
      "maxLength": 30,
      "type": [
        "null",
        "string"
      ]
    },
    "cidadeNascimento": {
      "default": "",
      "maxLength": 30,
      "type": [
        "null",
        "string"
      ]
    },
    "cidadeRG": {
      "default": "",
      "maxLength": 30,
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
    // `codigoBcoFolha` e `codigoBcoPagar` EXISTEM no contrato (seguem nos 415 nomes acima) e NÃO
    // entram neste recorte de propósito: por decisão do diretor (01/10/2026) eles saíram do envio,
    // porque são a conta PAGADORA da empresa, cadastrada pelo time de folha, e não o banco do
    // funcionário. Ver o teste do ponto 5.
    // O CÓDIGO IBGE do município de NASCIMENTO (0141), gêmeo de `codigoCidadeResid` no formato e no
    // de/para: `int32` anulável, com default `0`. Sai NULO enquanto o de/para de cidade estiver vazio,
    // nunca `0`, pelo mesmo motivo do resto: `0` é o default do fornecedor, não um município.
    "codMunicipioNascto": {
      "default": 0,
      "format": "int32",
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
    // ── O CLIENTE FINAL, o TOMADOR, que NÃO é a empresa do grupo ─────────────────────────────────
    // `int32` ANULÁVEL com default `0`, e é por isso que a régua dele é a da EMPRESA (piso 1) e não a
    // da FILIAL (0 legítimo): aqui `0` é o valor que a omissão produz, e seria referência a cliente
    // inexistente. Note o FORMATO, que é o outro ponto: `int32`, contra o `int16` de
    // `codigoEmpresa`/`codigoFilial` logo abaixo. São três campos diferentes, não três nomes do mesmo.
    "codigoCliente": {
      "default": 0,
      "format": "int32",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "null",
        "integer",
        "string"
      ]
    },
    // ── OS QUATRO CAMPOS DE CONTRATAÇÃO (autorizados pelo diretor em 01/10/2026) ───────────────
    // `codigoEmpresa` e `codigoFilial` são os DOIS ÚNICOS campos deste recorte que NÃO são
    // anuláveis E NÃO têm default (`type: ["integer","string"]`, sem `"null"`, sem `default`).
    // Omitir um `short` não-anulável em .NET cai no `default(short)` = 0, e foi isso que criou o
    // registro órfão medido na produção do fornecedor. Daí o fail-closed do ponto 8.
    "codigoEmpresa": {
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
        "integer",
        "string"
      ]
    },
    "codigoFilial": {
      "format": "int16",
      "pattern": "^-?(?:0|[1-9]\\d*)$",
      "type": [
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
    "dataAdmissao": {
      "format": "date-time",
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
    // A JORNADA, `qtdeHorasMes` e `qtdeHorasSem`, entrou na allowlist em 01/10/2026 (0140). Os dois são
    // `double` ANULÁVEIS com **`default 0`**, e é o default que explica por que o nulo do EA nunca pode
    // virar zero no caminho: zero aqui não é "informado como zero", é o default do fornecedor, e grava
    // "valor por hora vezes ZERO horas". Ver o ponto 11.
    //
    // `salarioHora` existe no contrato (segue nos 415 nomes), tem o MESMO `default 0`, e NÃO entra neste
    // recorte: ficou fora da allowlist de propósito, porque o contrato não descreve o campo e escrever
    // remuneração em campo de semântica não medida é tão ruim quanto mandar zero. Ver o teste do ponto 11.
    "qtdeHorasMes": {
      "default": 0,
      "format": "double",
      "pattern": "^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$",
      "type": [
        "null",
        "number",
        "string"
      ]
    },
    "qtdeHorasSem": {
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
    // `salario` é `double` COM default 0 e ANULÁVEL. O `pattern` admite o ponto DECIMAL, o que o
    // separa dos inteiros: "1500.5" casa aqui e NÃO casaria em `^-?(?:0|[1-9]\d*)$`.
    "salario": {
      "default": 0,
      "format": "double",
      "pattern": "^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$",
      "type": [
        "null",
        "number",
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
    // `tipoContrato` É EMITIDO (decisão do coordenador, 01/10/2026, sobre parecer do `seguranca`), e o
    // `default: "I"` é o motivo: o campo é gravado pelo fornecedor de qualquer jeito, então NÃO emitir
    // não deixa o prazo vazio, grava "Indeterminado" por omissão. Ver o ponto 9.
    "tipoContrato": {
      "default": "I",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    },
    // `tipoSalario` é a UNIDADE do salário, e entrou no recorte em 01/10/2026 pelo MESMO fundamento do
    // `tipoContrato` logo acima: ele tem `default: "M"` (Mês) no contrato, então NÃO emitir não deixa a
    // unidade vazia, declara MENSAL por omissão. Medido na produção: 7 admissões VIVAS com salário 9,34 e
    // 10,90, valores de HORA, entrariam na folha como salário MENSAL sem nada falhar. Ver o ponto 10.
    "tipoSalario": {
      "default": "M",
      "maxLength": 1,
      "type": [
        "null",
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
    },
    // `vinculo` é CÓDIGO DE UM CARACTERE, com lista fechada de 18 valores na `description`. Entra,
    // por construção, no grupo de CÓDIGO CURTO do ponto 4: não cabendo, vira NULO, nunca cortado.
    "vinculo": {
      "default": "",
      "maxLength": 1,
      "type": [
        "null",
        "string"
      ]
    }
  };

/**
 * Os 18 valores da `description` de `vinculo`, copiados do contrato (01/10/2026). É a LISTA FECHADA:
 * nada fora daqui pode sair do EA, porque o GI aceita a letra em silêncio e grava vínculo errado na
 * folha (não há validação de domínio no `Add`, medido em 01/10).
 */
const VINCULOS_DO_CONTRATO: readonly string[] = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "C", "D", "E", "F", "G", "H", "I", "J", "K",
];

/**
 * Os 7 valores da `description` de `tipoSalario`, copiados do contrato (01/10/2026): `A` Aula,
 * `C` Comissão, `D` Dia, `H` Hora, `M` Mês, `Q` Quinzenal, `T` Tarefa. É a LISTA FECHADA do campo; o EA
 * cobre DOIS dela (`H` e `M`), por decisão do diretor, e um terceiro valor só nasce com decisão humana.
 */
const TIPOS_SALARIO_DO_CONTRATO: readonly string[] = ["A", "C", "D", "H", "M", "Q", "T"];

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
  // O mapa IBGE é SEPARADO do de cidades desde 02/10/2026 (dois espaços de código, duas envs). Aqui ele
  // devolve o mesmo valor só para exercitar o zero à esquerda nos DOIS campos de município.
  codigoMunicipioIbge: () => "0350",
  // NÃO há `codigoBanco` aqui, e a ausência é a régua: o de/para de banco saiu junto com os campos
  // `codigoBcoFolha`/`codigoBcoPagar` (decisão do diretor). Se alguém devolver a chave ao tipo
  // `DeParaGi`, este literal volta a aceitá-la e o teste do ponto 5 é quem denuncia.
  //
  // `parEmpresaFilialConhecido` NÃO entra aqui, e a ausência é o conserto de 01/10/2026: ele chegou a
  // ser membro opcional de `DeParaGi` e saiu. `DeParaGi` é o contrato que o MONTADOR consome, o
  // montador não consulta o par, e quem o consulta é o `EnviarParaGiService`. Enquanto o membro ficou
  // aqui, todo dublê de de/para de CIDADE tinha de declarar algo que não tem nada a ver com cidade, e
  // o sintoma apareceu longe da causa: outra sessão rodou o gate, viu vermelho neste arquivo e no
  // `montador.spec.ts` e gastou tempo descobrindo que não era dela. Quem mede a régua do par é
  // `gi/gi-empresa-filial-failclosed.tester.spec.ts`, que injeta o tipo próprio
  // (`ParEmpresaFilialConhecido`, default `NENHUM_PAR_EMPRESA_FILIAL`, fail-closed).
};

// ── Os NOVE campos de CONTRATAÇÃO (o invariante novo da allowlist) ──────────────────────────────

/**
 * O envio deixou de ser "só dado de pessoa" e passou a ser "dado de pessoa MAIS os campos de
 * contratação NOMEADOS" (autorização do diretor, 01/10/2026, §A.6 revisto no mapa
 * `docs/MAPA-GI-4-CAMPOS-E-EXPURGO.md`). São NOVE, e não quatro, porque o CLIENTE são dois códigos, o
 * PRAZO é derivado do vínculo, o SALÁRIO leva a UNIDADE junto e a unidade `H` exige a JORNADA:
 * `salario`, `tipoSalario`, `qtdeHorasMes`, `qtdeHorasSem`, `dataAdmissao`, `vinculo`, `tipoContrato`,
 * `codigoEmpresa`, `codigoFilial`.
 *
 * OS TRÊS ÚLTIMOS A ENTRAR (01/10/2026) SÃO CORREÇÃO DE BLOQUEIO, não campo a mais, e os três pelo MESMO
 * fundamento: no GI `tipoSalario` tem `default "M"` e a jornada tem `default 0`, então **não emitir não
 * deixa o campo vazio, grava o default**. Sem a unidade, salário de hora virava MENSAL; com a unidade e
 * sem a jornada, virava "valor por hora vezes ZERO horas". Ver os pontos 10 e 11 e
 * `docs/MAPA-GI-UNIDADE-DO-SALARIO.md`.
 *
 * NOTA DE HISTÓRIA, curta e útil: até a arbitragem deste conflito, este arquivo tinha um ADAPTADOR que
 * descobria em qual parâmetro o montador aceitava a contratação, porque o teste foi escrito ANTES do
 * produto (§A.40 regra 2). O produto existe, a assinatura é a do terceiro parâmetro, e o adaptador
 * saiu: chamada direta, sem detecção.
 */
const CONTRATACAO_CHEIA: ContratacaoGi = {
  salario: 1500.5,
  // A JORNADA fica NULA na fixture do MENSALISTA, e isso não é lacuna: ela é exigida SÓ quando a unidade
  // é `H` (as outras seis fecham o período no próprio par valor+unidade). A fixture com jornada vive em
  // `gi/gi-salario-unidade.tester.spec.ts`, junto da régua que a exige.
  qtdeHorasMes: null,
  qtdeHorasSem: null,
  // A UNIDADE, sétimo campo, e `MENSAL` traduzido para a letra do GI. A fixture usa `M` de propósito:
  // `H` é DECLARÁVEL e NÃO é ENVIÁVEL (recusa por falta da jornada em horas), então um `H` aqui faria
  // toda esta casa medir o payload de um envio que a guarda do `POST` jamais deixaria sair. A régua do
  // `H` tem arquivo próprio: `gi/gi-salario-unidade.tester.spec.ts`.
  tipoSalario: "M",
  dataAdmissao: "2026-11-03",
  // `4` Temporário, com o prazo que o acoplamento manda para ele. ERA NULO até 01/10/2026, e virou `D`
  // por decisão do diretor: nulo NÃO deixava o campo vazio, fazia o GI aplicar o `default "I"`
  // (Indeterminado) num contrato que tem prazo. Ver o ponto 9.
  vinculo: "4",
  tipoContrato: "D",
  codigoEmpresa: 1,
  codigoFilial: 7,
  // O CLIENTE FINAL (0141), DÉCIMO campo de contratação. O valor é DELIBERADAMENTE distinto dos outros
  // dois códigos: com `1`, `7` e `12345` na mesma fixture, emitir um no lugar do outro fica vermelho em
  // vez de passar batido. A régua própria vive em `gi/gi-cliente-e-cidades.tester.spec.ts`.
  codigoCliente: 12345,
};

/** A contratação de um CLT a prazo determinado, onde o acoplamento `7` ⇒ `D` tem efeito. */
const CONTRATACAO_PRAZO_DETERMINADO: ContratacaoGi = {
  ...CONTRATACAO_CHEIA,
  vinculo: "7",
  tipoContrato: "D",
};

/**
 * Os DEZ nomes de campo de contratação no vocabulário do GI.
 *
 * O décimo (`codigoCliente`, 02/10/2026) é o CLIENTE FINAL, o tomador, e ele NÃO é a empresa do grupo:
 * `codigoEmpresa` e `codigoFilial` são o empregador do Grupo Soulan, `codigoCliente` é para quem o
 * serviço é prestado. São três códigos distintos no mesmo payload.
 */
const CAMPOS_DE_CONTRATACAO: readonly string[] = [
  "salario",
  "tipoSalario",
  "qtdeHorasMes",
  "qtdeHorasSem",
  "dataAdmissao",
  "vinculo",
  "tipoContrato",
  "codigoEmpresa",
  "codigoFilial",
  "codigoCliente",
];

/** A saída com pessoa mínima e a contratação completa. Chamada DIRETA. */
function montarCheio(contratacao: ContratacaoGi = CONTRATACAO_CHEIA): FuncionarioSelecao {
  return montarFuncionarioSelecao(PESSOA_MINIMA, DE_PARA_GI_VAZIO, contratacao);
}

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
 * OS DOIS GRUPOS DA NORMALIZAÇÃO NUMÉRICA, e a divisão é o ponto mais delicado desta régua.
 *
 * `cpf` e `pis` são NÚMERO DE DOCUMENTO: o zero à esquerda é um DÍGITO do documento, e tirá-lo não
 * normaliza, CORRÓI (`"09988877766"` viraria `"9988877766"`, que é outro CPF). Todo o resto é
 * CONTAGEM (DDD, zona, seção, código de município, número de porta), e ali `"0012"` e `"12"` são o
 * mesmo inteiro.
 *
 * ESTE GRUPO DIVERGE DO `pattern` DO CONTRATO DE PROPÓSITO, e a divergência está medida: o GI guarda
 * o CPF como `double` e devolveu `99999999999.0` no registro criado em 01/10/2026. O zero se perde no
 * ARMAZENAMENTO do fornecedor, não no nosso envio, então obedecer ao `pattern` aqui pagaria o preço
 * (um dígito a menos saindo do EA) sem comprar nada. Decisão do diretor, registrada no mapa
 * `docs/MAPA-GI-CONSERTOS-E-4-ENVIOS.md`.
 */
const CAMPOS_PRESERVAM_ZERO: readonly string[] = ["cpf", "pis"];

/**
 * O TERCEIRO grupo, que nasceu com o salário e cresceu com a JORNADA (0140): campo de VALOR ou de
 * MEDIDA, com casa decimal (jornada tem fração real, 7,33 h/dia, 36,40 h/semana). O `pattern` dele
 * admite o ponto (`(?:\.\d+)?`), então "1500.5" é válido ali e seria inválido no grupo inteiro.
 * Está separado para que a varredura do grupo inteiro não passe a mentir quando alguém "arredondar"
 * o salário para casar com um padrão que não é o dele.
 */
const CAMPOS_DECIMAIS: readonly string[] = ["salario", "qtdeHorasMes", "qtdeHorasSem"];

/** O grupo de padrão INTEIRO: todo campo com `pattern` que não é documento nem valor decimal. */
const CAMPOS_INTEIROS = CAMPOS_COM_PATTERN.filter(
  (c) => !CAMPOS_PRESERVAM_ZERO.includes(c.nome) && !CAMPOS_DECIMAIS.includes(c.nome),
);

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
 * ESTADO EM 01/10/2026 (segunda rodada), e DOIS dos quatro `it.fails` que sobravam codificavam o
 * requisito ERRADO, não um conserto pendente. Não sobrou nenhum `it.fails`:
 *   - ponto 3, INTEIROS: a normalização foi autorizada, e os testes do zero à esquerda e do DDD `01`
 *     viraram `it` normal. Eles FALHAM enquanto o montador não normalizar, e é esse o ponto.
 *   - ponto 3B, DOCUMENTO: o teste que pedia `"09988877766"` sair `"9988877766"` foi REESCRITO ao
 *     contrário. Ele pedia a corrupção do CPF; agora exige a preservação dos 11 dígitos.
 *   - ponto 6, BANCO: o teste que pedia `001` virar `1` ficou SEM OBJETO (o campo saiu do envio) e
 *     foi trocado pela régua nova: nenhuma chave de banco da empresa é emitida, agência e conta ficam.
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
    //
    // ⚠️ ESTE TESTE JÁ FALHOU DUAS VEZES COMO PREVISTO, e das duas o conserto foi do PRODUTO ou do
    // RECORTE, nunca da asserção. A primeira foi a contratação (`salario`, `dataAdmissao`, `vinculo`,
    // `codigoEmpresa`, `codigoFilial`), quando o recorte já tinha as chaves e o montador não as emitia.
    // A segunda foi em 02/10/2026 e no sentido INVERSO: o montador passou a emitir os cinco campos novos
    // (as três cidades, `codMunicipioNascto` e `codigoCliente`) e o recorte é que estava atrasado, então
    // o conserto foi COLAR o contrato real (`apigeral.gi.app.br/openapi/v1.json`, relido em 02/10). A
    // diferença impressa na falha nomeia, nos dois sentidos, exatamente quem está atrasado.
    expect(Object.keys(montarCheio()).sort()).toEqual(Object.keys(SCHEMA).sort());
  });

  it("SEM contratacao o montador nao inventa chave nenhuma a mais", () => {
    // O conjunto de chaves não pode DEPENDER da entrada: `codigoEmpresa` e `codigoFilial` são
    // não-anuláveis no contrato, então a chave existe sempre, e é o VALOR que falta. Chave que
    // aparece e desaparece conforme o dado é o que faz o GI receber payloads de formatos diferentes.
    const chavesSemContratacao = Object.keys(montarFuncionarioSelecao(PESSOA_MINIMA)).sort();
    const forasteiras = chavesSemContratacao.filter((k) => !(k in SCHEMA));
    expect(forasteiras).toEqual([]);
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

  it("NENHUMA chave de banco atravessa, nem por nome nem por codigo", () => {
    const f = montarFuncionarioSelecao({ ...PESSOA_MINIMA, banco: "Banco do Brasil" });
    // Nenhuma chave com "banco" por extenso: no contrato as únicas propriedades com "Banco" no nome
    // (`tipoMskBanco`, `tipoMskBancoReembolso`) são máscara de impressão, e o nome do banco vive só
    // em `TB_Banco`, outro schema.
    expect(Object.keys(f).filter((k) => /banco/i.test(k))).toEqual([]);
    // E nenhuma chave `Bco` tampouco: ver o teste abaixo para o PORQUÊ.
    expect(Object.keys(f).filter((k) => /bco/i.test(k))).toEqual([]);
  });
});

// ── PONTO 6: a INSTITUIÇÃO bancária saiu do envio; agência e conta ficaram ──────────────────────

describe("ponto 6: o EA nao emite banco da EMPRESA, e segue emitindo agencia e conta", () => {
  /**
   * DECISÃO DO DIRETOR (01/10/2026), e ela substitui a régua anterior desta casa, que exigia
   * normalizar o código de banco `001` para `1`. Aquele teste ficou SEM OBJETO: o campo não é mais
   * emitido, então não há o que normalizar.
   *
   * O MOTIVO, medido no contrato: `codigoBcoFolha`/`codigoBcoPagar` são chave estrangeira para
   * `TB_Banco`, que é o catálogo de CONTAS PAGADORAS DA EMPRESA (o `341` que apareceu na sonda é a
   * conta do contas a pagar), cadastrado pelo time de folha. O EA não tem o que dizer ali, e mandar
   * um código adivinhado escreveria conta de pagamento errada na folha.
   *
   * CONSEQUÊNCIA REGISTRADA, para ninguém ler isto como esquecimento: a instituição bancária DO
   * FUNCIONÁRIO não tem campo nenhum em `TB_FuncionarioSelecaoAPI` (nem na folha oficial). Depois
   * deste conserto o GI recebe AGÊNCIA e CONTA sem o banco, e quem informa o banco é a folha.
   */
  it("os dois campos de banco da empresa NAO sao emitidos, mesmo com banco preenchido", () => {
    const f = montarFuncionarioSelecao(
      { ...PESSOA_MINIMA, banco: "Banco do Brasil", agencia: "1234", conta: "56789-0" },
      DE_PARA_COM_ZERO_A_ESQUERDA,
    );
    expect(f).not.toHaveProperty("codigoBcoFolha");
    expect(f).not.toHaveProperty("codigoBcoPagar");
  });

  it("os dois nomes CONTINUAM existindo no contrato: a decisao e do EA, nao do GI", () => {
    // Guarda contra o conserto errado: tirar o campo do RECORTE porque ele "não existe mais" seria
    // falsear o contrato. Ele existe; o EA é que escolheu não preenchê-lo.
    expect(NOMES_DO_SCHEMA).toContain("codigoBcoFolha");
    expect(NOMES_DO_SCHEMA).toContain("codigoBcoPagar");
  });

  it("agencia e contaCorrente seguem sendo emitidas, com o corte do contrato", () => {
    const f = montarFuncionarioSelecao({ ...PESSOA_MINIMA, agencia: "1234", conta: "56789-0" });
    expect(f.agencia).toBe("1234");
    expect(f.contaCorrente).toBe("56789-0");
    const g = montarFuncionarioSelecao({ agencia: TEXTO_LONGO, conta: TEXTO_LONGO });
    expect(g.agencia).toHaveLength(10);
    expect(g.contaCorrente).toHaveLength(20);
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

describe("ponto 3: campo de padrao INTEIRO sai sem zero a esquerda", () => {
  /**
   * A NORMALIZAÇÃO TEM DOIS GRUPOS, e não um. Esta casa é só o PRIMEIRO.
   *
   * Aqui estão os campos de padrão INTEIRO (`^-?(?:0|[1-9]\d*)$`): `smsdddCel`, `titEleZona`,
   * `titEleSecao`, `codigoCidadeResid`, `nroEndereco`. Tirar o zero à esquerda deles é GANHO PURO,
   * porque `"0012"` e `"12"` são o MESMO inteiro: nada se perde, e o payload passa a casar com o
   * padrão que o GI valida (e por cujo descumprimento ele recusa o ENVIO TODO com 400).
   *
   * O outro grupo (`cpf`, `pis`) tem a régua OPOSTA, e está no `describe` seguinte.
   *
   * Valor sem dígito nenhum deve virar NULO, nunca string inválida (último teste desta casa).
   */
  it("os TRES grupos cobrem TODOS os campos com pattern, e nao se sobrepoem", () => {
    // Guarda do próprio teste: campo numérico novo cai em um dos três grupos, nunca em nenhum.
    expect(
      [
        ...CAMPOS_INTEIROS.map((c) => c.nome),
        ...CAMPOS_PRESERVAM_ZERO,
        ...CAMPOS_DECIMAIS,
      ].sort(),
    ).toEqual(CAMPOS_COM_PATTERN.map((c) => c.nome).sort());
    const fora = CAMPOS_INTEIROS.map((c) => c.nome).filter(
      (n) => CAMPOS_PRESERVAM_ZERO.includes(n) || CAMPOS_DECIMAIS.includes(n),
    );
    expect(fora).toEqual([]);
  });

  it("nenhum campo de padrao INTEIRO sai com zero a esquerda", () => {
    const f = montarFuncionarioSelecao(
      {
        ...PESSOA_MINIMA,
        // CPF/PIS sintéticos da faixa reservada 099, iniciados em zero: entram aqui só para provar
        // que a varredura do grupo inteiro não os alcança (eles têm a régua oposta).
        cpf: "09988877766",
        pis: "01234567890",
        tituloZona: "007",
        tituloSecao: "0042",
        telefone: "011999887766",
        numero: "0042",
      },
      DE_PARA_COM_ZERO_A_ESQUERDA,
    );
    const violacoes = CAMPOS_INTEIROS.filter(({ nome, pattern }) => {
      const v = valorDe(f, nome);
      if (v == null) return false;
      return !new RegExp(pattern).test(String(v));
    }).map(({ nome }) => `${nome}=${String(valorDe(f, nome))}`);
    expect(violacoes).toEqual([]);
  });

  it("o DDD de telefone com zero inicial NAO sai como `01`", () => {
    // `smsdddCel` é `uint8` com pattern; "01" viola o padrão E está errado como DDD (o zero é
    // prefixo de operadora, não parte do DDD). O esperado é "11", e o número fica sem o zero.
    const f = montarFuncionarioSelecao({ telefone: "011999887766" });
    expect(f.smsdddCel).toBe("11");
  });

  it("DDD de telefone SEM o zero de operadora continua intacto", () => {
    // Guarda contra o conserto grosseiro (cortar o primeiro dígito sempre): 11 dígitos com 9 na
    // frente do número é o caso normal, e o DDD segue sendo os dois primeiros.
    const f = montarFuncionarioSelecao({ telefone: "11999887766" });
    expect(f.smsdddCel).toBe("11");
  });

  it("zona e secao do titulo saem como inteiro", () => {
    const f = montarFuncionarioSelecao({ tituloZona: "007", tituloSecao: "0042" });
    expect(f.titEleZona).toBe("7");
    expect(f.titEleSecao).toBe("42");
  });

  it("o codigo de cidade do de/para sai sem zero a esquerda", () => {
    const f = montarFuncionarioSelecao(PESSOA_MINIMA, DE_PARA_COM_ZERO_A_ESQUERDA);
    expect(f.codigoCidadeResid).toBe("350");
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

// ── PONTO 3B: cpf e pis PRESERVAM o zero à esquerda (a régua OPOSTA) ───────────────────────────

describe("ponto 3b: numero de documento preserva TODOS os digitos, zero a esquerda incluido", () => {
  /**
   * Esta casa existe para IMPEDIR um conserto, não para pedir um. A régua anterior, escrita quando a
   * normalização numérica foi só proposta, exigia `"09988877766"` sair como `"9988877766"`. Isso
   * pedia a CORRUPÇÃO do documento: o CPF perderia um dígito, e a pessoa chegaria à folha com outro
   * número, sem nada falhar em lugar nenhum.
   *
   * Quem normalizar os numéricos "todos de uma vez", com uma varredura só, quebra estes dois testes.
   * É exatamente para isso que eles estão aqui.
   */
  it("o CPF iniciado em zero PRESERVA os 11 digitos", () => {
    const f = montarFuncionarioSelecao({ cpf: "099.888.777-66" });
    expect(f.cpf).toBe("09988877766");
    expect(String(f.cpf)).toHaveLength(11);
  });

  it("o PIS iniciado em zero PRESERVA os 11 digitos", () => {
    const f = montarFuncionarioSelecao({ pis: "012.34567.89-0" });
    // A máscara SAI (ponto e hífen não passam no `pattern` do contrato, que só admite o ponto
    // DECIMAL), mas nenhum dígito sai com ela, e o zero da frente fica.
    expect(f.pis).toBe("01234567890");
  });

  it("a divergencia do `pattern` e CONSCIENTE, nao um descuido", () => {
    // O padrão do contrato REPROVA o valor que o EA emite de propósito. Deixar isto escrito num
    // teste é o que impede a próxima sessão de "consertar" a reprovação cortando o dígito.
    const padraoDoContrato = new RegExp(SCHEMA.cpf.pattern as string);
    expect(padraoDoContrato.test("09988877766")).toBe(false);
    expect(montarFuncionarioSelecao({ cpf: "09988877766" }).cpf).toBe("09988877766");
  });

  it("CPF e PIS sem zero a esquerda seguem casando com o contrato", () => {
    const f = montarFuncionarioSelecao({ cpf: "999.888.777-66", pis: "123.45678.90-1" });
    expect(f.cpf).toBe("99988877766");
    expect(f.pis).toBe("12345678901");
    for (const nome of CAMPOS_PRESERVAM_ZERO) {
      const pattern = new RegExp(SCHEMA[nome].pattern as string);
      expect(pattern.test(String(valorDe(f, nome))), nome).toBe(true);
    }
  });

  it("documento sem digito nenhum vira NULO, nunca string vazia", () => {
    const f = montarFuncionarioSelecao({ cpf: "   ", pis: "-" });
    expect(f.cpf).toBeNull();
    expect(f.pis).toBeNull();
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
  it("os 12 campos de codigo curto sao exatamente os esperados", () => {
    // `vinculo` e `tipoContrato` entraram no grupo em 01/10/2026, e entraram NO LUGAR CERTO: são
    // códigos de 1 caractere com lista fechada, então "Temporário" não pode ser cortado em "T" (que no
    // GI não é vínculo nenhum, e no campo de prazo não é nem `D` nem `I`). `tipoSalario` entrou no mesmo
    // dia e pelo mesmo motivo: "MENSAL" cortado em "M" acertaria por acidente, e "HORA" cortado em "H"
    // produziria a letra que a guarda do envio existe para RECUSAR.
    expect(CAMPOS_DE_CODIGO_CURTO.sort()).toEqual(
      [
        "vinculo",
        "tipoContrato",
        "tipoSalario",
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
    // `undefined` é "não emitido", que é outra pergunta (a do ponto 1) e não um código inventado.
    const inventados = CAMPOS_DE_CODIGO_CURTO.filter((nome) => {
      const v = valorDe(f, nome);
      return v !== null && v !== undefined;
    }).map(
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

// ── PONTO 7: os QUATRO campos de contratação novos existem no contrato e cabem nele ─────────────

describe("ponto 7: salario, tipoSalario, jornada, dataAdmissao, vinculo, empresa e filial", () => {
  /**
   * Requisito autorizado pelo diretor (01/10/2026): o envio passa a levar SALÁRIO, DATA DE ADMISSÃO,
   * VÍNCULO e o CLIENTE (empresa + filial). Esta casa prova a parte do CONTRATO (sempre verificável,
   * sem depender do produto) e a parte do MONTADOR (que falha até os campos serem emitidos).
   */
  it("os oito nomes pertencem as 415 propriedades de TB_FuncionarioSelecaoAPI", () => {
    for (const nome of [
      "salario",
      "tipoSalario",
      "qtdeHorasMes",
      "qtdeHorasSem",
      "dataAdmissao",
      "vinculo",
      "codigoEmpresa",
      "codigoFilial",
    ]) {
      expect(NOMES_DO_SCHEMA, nome).toContain(nome);
    }
  });

  it("os NOVE campos de contratacao sao emitidos, e a chave existe mesmo vazia", () => {
    // A chave não pode depender do dado: `codigoEmpresa` e `codigoFilial` são não-anuláveis no
    // contrato, e payload de formato variável é o que faz o fornecedor aplicar default sem ninguém ver.
    const cheio = Object.keys(montarCheio());
    const vazio = Object.keys(montarFuncionarioSelecao(PESSOA_MINIMA));
    for (const campo of CAMPOS_DE_CONTRATACAO) {
      expect(cheio, `${campo} nao emitido com contratacao`).toContain(campo);
      expect(vazio, `${campo} desaparece sem contratacao`).toContain(campo);
    }
  });

  it("vinculo respeita o maxLength 1 do contrato", () => {
    expect(SCHEMA.vinculo.maxLength).toBe(1);
    const v = montarCheio().vinculo as unknown;
    if (v != null) expect(String(v).length).toBeLessThanOrEqual(1);
  });

  it("vinculo emitido pertence a LISTA FECHADA dos 18 valores do contrato", () => {
    // O GI NÃO valida o domínio (aceita a letra em silêncio), então a lista fechada tem de ser
    // garantida aqui: letra fora dela vira vínculo errado na folha, sem erro nenhum aparecer.
    expect(VINCULOS_DO_CONTRATO).toHaveLength(18);
    const v = montarCheio().vinculo as unknown;
    expect(v, "vinculo fora da lista fechada do contrato").not.toBeNull();
    expect(VINCULOS_DO_CONTRATO).toContain(String(v));
  });

  it("salario e dataAdmissao atravessam, e o salario casa com o pattern DECIMAL do contrato", () => {
    const f = montarCheio();
    const salario = valorDe(f, "salario");
    expect(salario, "salario nao foi emitido").not.toBeNull();
    expect(new RegExp(SCHEMA.salario.pattern as string).test(String(salario))).toBe(true);
    expect(valorDe(f, "dataAdmissao"), "dataAdmissao nao foi emitida").not.toBeNull();
  });

  it("empresa e filial atravessam como INTEIRO, sem zero a esquerda", () => {
    const f = montarCheio();
    for (const nome of ["codigoEmpresa", "codigoFilial"]) {
      const v = valorDe(f, nome);
      expect(v, `${nome} nao foi emitido`).not.toBeNull();
      expect(new RegExp(SCHEMA[nome].pattern as string).test(String(v)), nome).toBe(true);
    }
  });
});

// ── PONTO 8: empresa e filial NUNCA saem como 0 (o registro órfão) ──────────────────────────────

describe("ponto 8: codigoEmpresa e codigoFilial nunca valem 0 no payload", () => {
  /**
   * MEDIDO NA PRODUÇÃO DO FORNECEDOR (01/10/2026): os dois campos são `int16` NÃO-ANULÁVEIS e SEM
   * default; omitir um `short` em .NET cai no `default(short)` = 0, e o registro nasce ÓRFÃO (empresa
   * 0, filial 0), aceito sem erro. Por isso o `0` é pior que a recusa: ele não falha em lugar nenhum.
   *
   * A RECUSA DO ENVIO é provada no spec do serviço (`gi-empresa-filial-failclosed.tester.spec.ts`).
   * Aqui se prova a outra metade: se o montador emitir algo, não pode ser 0.
   */
  it("com empresa e filial resolvidas, nenhum dos dois sai 0", () => {
    const f = montarCheio();
    for (const nome of ["codigoEmpresa", "codigoFilial"]) {
      const v = valorDe(f, nome);
      expect(String(v), nome).not.toBe("0");
      expect(v, nome).not.toBe(0);
    }
  });

  it("SEM empresa e filial, o montador nao fabrica 0 (sai NULO ou ausente)", () => {
    // Fail-closed no montador: na falta do de/para, o campo fica VAZIO e quem recusa o envio é o
    // serviço. Preencher 0 aqui faria a recusa do serviço virar decorativa, porque o payload já
    // estaria "válido" para o GI.
    const f = montarFuncionarioSelecao(PESSOA_MINIMA);
    for (const nome of ["codigoEmpresa", "codigoFilial"]) {
      const v = valorDe(f, nome);
      expect(v === null || v === undefined, `${nome} saiu como ${String(v)}`).toBe(true);
    }
  });
});

// ── PONTO 9: a ARMADILHA do `tipoContrato`, que É EMITIDO mas NÃO é o nosso tipo de contrato ────

describe("ponto 9: tipoContrato (D/I) e o PRAZO, acoplado ao vinculo, e nao o nosso tipo_contrato", () => {
  /**
   * ARBITRAGEM DO COORDENADOR (01/10/2026), sobre parecer do `seguranca`, e ela SUBSTITUI a régua
   * anterior deste arquivo, que exigia o oposto. **O EA EMITE `tipoContrato`.**
   *
   * O FUNDAMENTO, e ele é o que inverte a conclusão: o campo tem **`default: "I"` no contrato**, então
   * NÃO emitir não deixa o prazo vazio, grava **"Indeterminado" por omissão**. Com `vinculo = 7` (CLT
   * Prazo Determinado) isso gravaria "prazo determinado" com "indeterminado" ao lado, contraditório e
   * silencioso, na folha. Emitir é o que torna a contradição impossível.
   *
   * ⚠️ A COLISÃO DE NOME CONTINUA SENDO O PERIGO, e emitir o campo AUMENTA o risco, não diminui: agora
   * existe no payload uma chave chamada `tipoContrato` que NÃO é `admissoes.tipo_contrato`. O nosso
   * (Temporário, Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz) é o REGIME, e vira `vinculo`.
   * Ligar um no outro pelo nome gravaria "T" num campo de prazo da folha, e o `Add` aceita a letra em
   * silêncio. Os testes abaixo são a rede contra isso.
   */
  it("o campo tipoContrato existe no contrato, vale 1 caractere, e tem default I", () => {
    expect(NOMES_DO_SCHEMA).toContain("tipoContrato");
    expect(SCHEMA.tipoContrato.maxLength).toBe(1);
    // O default é o fundamento da decisão de emitir: sem ele, não emitir seria inofensivo.
    expect(SCHEMA.tipoContrato.default).toBe("I");
  });

  it("o montador EMITE tipoContrato, e o valor atravessa como D ou I", () => {
    expect(montarCheio(CONTRATACAO_PRAZO_DETERMINADO).tipoContrato).toBe("D");
    expect(montarCheio({ ...CONTRATACAO_CHEIA, vinculo: "1", tipoContrato: "I" }).tipoContrato).toBe("I");
  });

  it("INVARIANTE ACOPLADO: vinculo 7 obriga prazo D, e vinculo 1 obriga prazo I", () => {
    /**
     * NÃO SÃO DOIS CAMPOS INDEPENDENTES, e é por isso que este teste existe separado do de cima: o
     * prazo é DERIVADO do vínculo, numa função só (`prazoContratoGi`), e não coletado em lugar nenhum.
     * Enquanto for assim, "vínculo a prazo determinado com prazo indeterminado ao lado" é
     * estruturalmente impossível. No dia em que alguém passar a LER o prazo de uma coluna, este teste
     * é quem cobra a coerência de volta.
     */
    expect(prazoContratoGi("7")).toBe("D");
    expect(prazoContratoGi("1")).toBe("I");
  });

  it("INVARIANTE ACOPLADO, no sentido INVERSO: prazo D sai dos QUATRO a termo, e I so do vinculo 1", () => {
    // O sentido inverso é o que pega a tabela editada pela metade: alguém acrescenta um vínculo novo e
    // lhe dá prazo `D` sem ele ser contrato a termo, ou troca o prazo do `1`.
    //
    // O CONJUNTO MUDOU em 01/10/2026 e o inverso mudou COM ele, de propósito: era `["7"]` e passou a ser
    // os QUATRO contratos a termo (`4` Temporário, `7` CLT Prazo Determinado, `J` Estagiário,
    // `H` Menor Aprendiz). O inverso continua FECHADO: é ele, e não o sentido direto, que denuncia o
    // quinto vínculo que alguém pendurar em `D` sem decisão do diretor.
    const TODOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const comD = TODOS.filter((v) => prazoContratoGi(v) === "D");
    const comI = TODOS.filter((v) => prazoContratoGi(v) === "I");
    expect(comD).toEqual(["4", "7", "H", "J"]);
    expect(comI).toEqual(["1"]);
    // E o `D` do vínculo `4` atravessa até o payload, pelo caminho que a produção usa.
    expect(montarCheio().tipoContrato).toBe("D");
  });

  it("vinculo SEM prazo decidido sai NULO, e NULO NAO E NEUTRO: o GI grava I por default", () => {
    /**
     * ESTE TESTE INVERTEU O SENTIDO em 01/10/2026, e o motivo tem de ficar escrito, porque a redação
     * anterior afirmava o contrário com confiança: ela dizia que nulo "preserva o comportamento de hoje,
     * em vez de inventar regra de folha", e tratava `4`, `J` e `H` como "a decisão de não decidir".
     *
     * ERA FALSO, e o contrato é quem desmente: `tipoContrato` tem **`default "I"`**, então não emitir
     * NÃO deixa o campo vazio, grava **Indeterminado**. Para os três, que são contratos A TERMO, o nulo
     * era uma decisão de folha silenciosa, e a mais errada das duas possíveis. Por isso os três passaram
     * a `D` (decisão do diretor) e sobrou aqui só o vínculo que ninguém mapeou.
     *
     * O QUE ESTE TESTE AINDA MEDE, e por isso ele não foi apagado junto com a premissa: o conjunto do
     * nulo é FECHADO, e todo nome dentro dele é um vínculo que chegará à folha como Indeterminado. Ele é
     * a lista de quem herda o default do fornecedor, não uma lista de campos vazios.
     */
    expect(SCHEMA.tipoContrato.default, "o fundamento: nulo cai no default do GI").toBe("I");
    const TODOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const semPrazo = TODOS.filter((v) => prazoContratoGi(v) === null);
    expect(semPrazo).toEqual(["2", "3", "5", "6", "8", "9", "C", "D", "E", "F", "G", "I", "K"]);
    // E nenhum dos QUATRO a termo sobrou aqui, que é o conserto desta rodada.
    for (const v of ["4", "7", "J", "H"]) {
      expect(semPrazo, `vinculo a termo ${v} voltou a sair NULO (o GI gravaria I)`).not.toContain(v);
    }
  });

  it("o acoplamento vale pelo caminho REAL (tipo_contrato do EA, nao o codigo)", () => {
    // Prova o par completo pelo caminho que a produção usa: texto livre do EA -> vínculo -> prazo.
    const c = montarContratacaoGi({
      salario: "1500.50",
      dataAdmissao: "2026-11-03",
      tipoContrato: "Terceirizado",
      vinculos: [{ tipoServico: "TERCEIRO", empresaCodigo: "1", filial: "4", ativo: true }],
    });
    expect(c.vinculo).toBe(mapearVinculoGi("Terceirizado"));
    expect(c.vinculo).toBe("1");
    expect(c.tipoContrato).toBe("I");
  });

  it("o TEXTO do EA nunca aparece no payload, em NENHUM campo", () => {
    // Mais forte que olhar uma chave: "Terceirizado" não pode atravessar em casa nenhuma. Se aparecer,
    // é porque o de/para foi contornado em algum lugar.
    const c = montarContratacaoGi({
      salario: "1500.50",
      tipoContrato: "Terceirizado",
      vinculos: [{ tipoServico: "TERCEIRO", empresaCodigo: "1", filial: "4", ativo: true }],
    });
    const f = montarFuncionarioSelecao(PESSOA_MINIMA, DE_PARA_GI_VAZIO, c);
    const vazou = Object.entries(f as unknown as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && /terceiriz|tempor|fopag|estagi|aprendiz/i.test(v))
      .map(([k]) => k);
    expect(vazou).toEqual([]);
  });

  it("REDE DE RUNTIME: valor fora de {D, I} no campo de prazo sai NULO, nunca repassado", () => {
    /**
     * ⚠️ ESTE VERMELHO É O GAP QUE O COORDENADOR MANDOU FECHAR POR TESTE, E NÃO POR TIPO ⚠️
     *
     * Hoje o montador faz `tipoContrato: c.tipoContrato`, repasse CRU. A única coisa que impede
     * "Temporário" de chegar ao campo de prazo da folha é o TIPO (`"D" | "I" | null`), checado em tempo
     * de COMPILAÇÃO. O cast abaixo é o que um `as` descuidado, um `JSON.parse` de payload externo ou
     * uma leitura nova de banco fariam sem o compilador reclamar.
     *
     * POR QUE ISSO NÃO É ZELO TEÓRICO: o `Add` do GI **aceita a letra em silêncio** e grava. É a mesma
     * família da §A.33 (arquivar contrato sem assinatura): dano permanente num campo de folha, sem
     * nenhum erro aparecer, e por isso a guarda tem de morar no CÓDIGO e ter TESTE, não depender de
     * quem edita lembrar do tipo.
     *
     * O conserto é uma linha: filtrar o valor contra `{D, I}` antes de emitir, nulo caso contrário
     * (exatamente o que `codigoCurto` já faz para os outros códigos deste payload).
     */
    const forcado = montarCheio({
      ...CONTRATACAO_CHEIA,
      tipoContrato: "Temporário" as unknown as "D" | "I" | null,
    });
    expect(forcado.tipoContrato).toBeNull();
  });

  it("REDE DE RUNTIME, o mesmo buraco no VINCULO, que nao tem nem a protecao do tipo", () => {
    /**
     * ⚠️ ACHADO ADICIONAL, e ele é MAIS GRAVE que o de cima: `ContratacaoGi.vinculo` é `string | null`,
     * uma união ABERTA, então aqui **nem o compilador reclama**. Qualquer string atravessa para um
     * campo de 1 caractere com lista fechada de 18 valores, sem cast nenhum e sem erro nenhum.
     *
     * O ponto 7 já exige que o valor emitido pertença à lista fechada, mas ele prova isso com a entrada
     * BOA. Este prova com a entrada RUIM, que é a pergunta diferente.
     */
    const forcado = montarCheio({ ...CONTRATACAO_CHEIA, vinculo: "Temporário" });
    expect(forcado.vinculo).toBeNull();
  });

  it("a allowlist segue FECHADA: pessoa MAIS os dez de contratacao, e nada mais", () => {
    /**
     * O INVARIANTE MUDOU e precisa estar escrito (§A.6 + autorização do diretor): de "só dado de
     * pessoa" para "dado de pessoa MAIS os campos de contratação NOMEADOS". São DEZ desde 02/10/2026, quando o CLIENTE FINAL (o tomador) entrou. O que ele proíbe é a
     * terceira classe: situação trabalhista, desconto, benefício, FGTS, centro de custo, sindicato,
     * cargo, qualquer outro campo de folha. Entre as 415 propriedades do GI há centenas delas, e o
     * custo de uma passar é escrever folha errada sem erro aparente.
     */
    const PESSOA_MAIS_CONTRATACAO = new Set([
      ...Object.keys(montarFuncionarioSelecao(PESSOA_MINIMA, DE_PARA_COM_ZERO_A_ESQUERDA)),
      ...CAMPOS_DE_CONTRATACAO,
    ]);
    const deCarona = Object.keys(montarCheio()).filter((k) => !PESSOA_MAIS_CONTRATACAO.has(k));
    expect(deCarona).toEqual([]);
    // E a contagem é fechada: campo novo obriga a revisar este número de propósito, em vez de crescer
    // calado. 44 de pessoa mais os 10 de contratação.
    //
    // O NÚMERO FOI DE 49 PARA 54 em 02/10/2026, e os CINCO são nomeáveis um a um, que é o ponto de a
    // contagem ser fechada: quatro de PESSOA (`cidadeNascimento`, `cidadeRG`, `cidadeExpedicao` e
    // `codMunicipioNascto`, 40 ⇒ 44) e UM de CONTRATAÇÃO (`codigoCliente`, 9 ⇒ 10). Campo que entre sem
    // passar por esta linha cresce calado, e foi para isso que o número existe.
    //
    // DE 54 PARA 55 em 06/10/2026, e o 55o é nomeável: `apiSincAdmissaoDigital`, que decide se a
    // pré-admissão fica ESPERANDO no fornecedor ou é consumida por ele em menos de 10 minutos (medido
    // em produção do GI: com `false` o registro some, com `true` permanece). A chave sai SEMPRE, nunca
    // omitida, porque default do outro lado é contrato que muda sem aviso. O valor vem da env
    // `GI_API_SINC_ADMISSAO_DIGITAL`, com default `false`, que é o comportamento de hoje.
    expect(Object.keys(montarCheio())).toHaveLength(55);
    expect(PESSOA_MAIS_CONTRATACAO.size).toBe(55);
  });

  it("nenhum campo de SITUACAO trabalhista ou DESCONTO e emitido", () => {
    const chaves = Object.keys(montarCheio());
    const proibidos = chaves.filter((k) =>
      /^(situacao|desconto|fgts|sindicato|centroCusto|codigoCentroCusto|codigoDepto|codigoCargo|codigoSindicato|codigoContrato)/i.test(
        k,
      ),
    );
    expect(proibidos).toEqual([]);
  });
});

// ── PONTO 10: tipoSalario, a UNIDADE, e o DEFAULT que grava MENSAL sozinho ──────────────────────

describe("ponto 10: tipoSalario e a UNIDADE do salario, com default M no contrato", () => {
  /**
   * O ACHADO QUE ORIGINOU O CAMPO (medido na produção em 01/10/2026): `dados_vaga_folha.salario` é um
   * `numeric(12,2)` SEM unidade, e há **7 admissões VIVAS com 9,34 e 10,90**, que são valores de HORA.
   * No contrato, `tipoSalario` tem **`default "M"` (Mês)**. Então enviar o salário sem a unidade faz
   * aquelas 7 entrarem na folha como **salário MENSAL de R$ 9,34**, passando por TODAS as guardas que já
   * existiam (valor positivo, empresa e filial resolvidas, par conhecido). É a família da §A.33: o
   * fornecedor responde sucesso, o EA carimba o envio, nada falha, e o erro aparece no holerite.
   *
   * ⚠️ O PERIGO NÃO É MANDAR O CAMPO ERRADO, É OMITIR. Por isso a régua desta casa é dupla: o campo
   * ATRAVESSA o payload (aqui) e a guarda barra o **`POST` inteiro** quando ele não serve (lá, em
   * `gi/gi-salario-unidade.tester.spec.ts`). Esvaziar o campo seria exatamente cair no default.
   */
  it("o campo existe no contrato, vale 1 caractere, e o default dele e M", () => {
    expect(NOMES_DO_SCHEMA).toContain("tipoSalario");
    expect(SCHEMA.tipoSalario.maxLength).toBe(1);
    // O default é o fundamento inteiro: sem ele, omitir o campo seria inofensivo.
    expect(SCHEMA.tipoSalario.default).toBe("M");
  });

  it("a unidade MENSAL declarada atravessa como M", () => {
    expect(montarCheio().tipoSalario).toBe("M");
  });

  it("a unidade HORA declarada ATRAVESSA como H, e NAO e esvaziada pelo montador", () => {
    /**
     * CONTRAINTUITIVO DE PROPÓSITO, e é o ponto mais delicado da régua: o `H` é RECUSADO no envio
     * (`GI_SALARIO_HORISTA_SEM_HORAS`, porque `qtdeHorasMes` tem default `0` e o EA não tem jornada em
     * horas), e ainda assim ele tem de CHEGAR ao payload.
     *
     * POR QUÊ: é o valor no payload que permite à guarda nomear o motivo CERTO ("é horista e falta a
     * jornada") em vez do motivo errado ("ninguém declarou"). Montador que zerasse o `H` aqui
     * transformaria um horista declarado em "não declarado", perderia a diferença que a tela precisa
     * mostrar ao time, e, pior, deixaria o payload idêntico ao de quem não declarou nada.
     */
    expect(montarCheio({ ...CONTRATACAO_CHEIA, tipoSalario: "H" }).tipoSalario).toBe("H");
  });

  it("a unidade NAO declarada sai NULA, e NUNCA vira M no caminho", () => {
    // Nulo e `M` produziriam o MESMO envio querendo dizer coisas diferentes ("não declarado" x
    // "declarado mensal"), porque `M` é o default do fornecedor. Quem separa os dois é o nulo.
    expect(montarCheio({ ...CONTRATACAO_CHEIA, tipoSalario: null }).tipoSalario).toBeNull();
    expect(montarFuncionarioSelecao(PESSOA_MINIMA).tipoSalario).toBeNull();
  });

  it("o valor emitido pertence a LISTA FECHADA dos 7 valores do contrato", () => {
    expect(TIPOS_SALARIO_DO_CONTRATO).toHaveLength(7);
    for (const unidade of ["M", "H"] as const) {
      const v = montarCheio({ ...CONTRATACAO_CHEIA, tipoSalario: unidade }).tipoSalario;
      expect(TIPOS_SALARIO_DO_CONTRATO, `tipoSalario fora da lista fechada`).toContain(String(v));
    }
  });

  it("REDE DE RUNTIME: valor fora de {H, M} sai NULO, nunca repassado", () => {
    /**
     * Mesmo buraco do `tipoContrato` e do `vinculo`: um `as`, um `JSON.parse` de payload externo ou uma
     * leitura nova de banco fariam o vocabulário do EA ("MENSAL", 6 caracteres) atravessar para um campo
     * de 1 caractere. O GI aceita a letra em silêncio e grava, então a guarda tem de morar no CÓDIGO.
     *
     * NÃO BASTA SAIR NULO, e o nulo aqui não é um passe: ele é justamente o que a guarda do envio RECUSA
     * com `GI_SALARIO_SEM_UNIDADE`. Nulo no payload é recusa, não omissão silenciosa.
     */
    for (const lixo of ["MENSAL", "HORA", "m", "X", "", "MM"]) {
      const f = montarCheio({ ...CONTRATACAO_CHEIA, tipoSalario: lixo as unknown as "H" | "M" | null });
      expect(f.tipoSalario, `lixo "${lixo}" atravessou`).toBeNull();
    }
  });

  it("o EA cobre os SETE valores do contrato, e NENHUM deles sai NULO por omissao de lista", () => {
    /**
     * ESTE TESTE INVERTEU em 01/10/2026, e a inversão é a correção de um BLOQUEIO levantado pela
     * auditoria, não um alargamento de escopo. A redação anterior exigia que `A`, `C`, `D`, `Q` e `T`
     * saíssem NULOS, porque o EA cobria só `H` e `M`.
     *
     * O QUE DERRUBOU AQUELA RÉGUA: **escolha binária obrigatória FORÇA declaração falsa.** O time marcaria
     * `M` (Mês) quando a verdade fosse `D` (Dia) ou `Q` (Quinzenal), porque não haveria a opção certa, e
     * aí o valor errado passaria a carregar um selo dizendo que alguém conferiu: **o selo viraria o
     * problema**, que é o oposto do que a regra do diretor quer. A lista do EA passou a ser a do
     * fornecedor INTEIRA (7 valores, `SALARIO_UNIDADES_EA`, espelhada no CHECK da 0140).
     *
     * O QUE A RÉGUA AINDA MEDE, e por isso ela não virou um teste frouxo: o conjunto emitível é DERIVADO
     * do de/para, então letra nova fora dele continua caindo em NULO (teste acima), e cada um dos sete sai
     * como ELE MESMO, nunca traduzido para o vizinho.
     */
    for (const letra of TIPOS_SALARIO_DO_CONTRATO) {
      const f = montarCheio({
        ...CONTRATACAO_CHEIA,
        tipoSalario: letra as unknown as "H" | "M",
        // `H` exige jornada no ENVIO, não no montador: aqui a pergunta é só se a letra atravessa.
      });
      expect(f.tipoSalario, `a unidade ${letra} do contrato saiu NULA`).toBe(letra);
    }
  });
});

// ── PONTO 11: a JORNADA em horas, e o `default 0` que grava "vezes ZERO horas" ──────────────────

describe("ponto 11: qtdeHorasMes e qtdeHorasSem, a jornada que o tipoSalario H exige", () => {
  /**
   * ENTROU EM 01/10/2026 (0140), e é a OUTRA METADE do achado da unidade. Declarar `H` não bastava:
   * medido no contrato, `salarioHora`, `qtdeHorasMes` e `qtdeHorasSem` são `double` com **`default 0`**,
   * e o EA emite só os campos nomeados das duas allowlists. Então `tipoSalario = "H"` sem jornada gravaria
   * um horista com ZERO horas por mês, trocando "R$ 9,34 por mês" por "R$ 9,34 por hora vezes 0 horas":
   * outro valor errado, pela MESMA falha de `default 0` em campo de folha.
   *
   * A régua de QUEM EXIGE a jornada é do envio (`gi/gi-salario-unidade.tester.spec.ts`). Aqui se mede o
   * que o payload faz com ela.
   */
  it("os dois campos existem no contrato e tem default 0", () => {
    for (const nome of ["qtdeHorasMes", "qtdeHorasSem"]) {
      expect(NOMES_DO_SCHEMA, nome).toContain(nome);
      expect(SCHEMA[nome].default, `${nome} sem o default que origina o dano`).toBe(0);
    }
  });

  it("a jornada NAO INFORMADA sai NULA, e NUNCA 0 (zero e o default do fornecedor)", () => {
    // É a mesma distinção de empresa/filial e da unidade: nulo é "não informado" e RECUSA no envio; zero
    // seria "informado como zero", que o GI grava calado. Trocar um pelo outro é o dano inteiro.
    const f = montarCheio();
    expect(f.qtdeHorasMes).toBeNull();
    expect(f.qtdeHorasSem).toBeNull();
    const g = montarFuncionarioSelecao(PESSOA_MINIMA);
    expect(g.qtdeHorasMes).toBeNull();
    expect(g.qtdeHorasSem).toBeNull();
  });

  it("a jornada informada atravessa, com fracao, e casa com o pattern DECIMAL", () => {
    const f = montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasMes: 220, qtdeHorasSem: 36.4 });
    expect(f.qtdeHorasMes).toBe(220);
    expect(f.qtdeHorasSem).toBe(36.4);
    for (const nome of ["qtdeHorasMes", "qtdeHorasSem"]) {
      const pattern = new RegExp(SCHEMA[nome].pattern as string);
      expect(pattern.test(String(valorDe(f, nome))), nome).toBe(true);
    }
  });

  it("REDE DE RUNTIME: zero, negativo e lixo viram NULO, nunca atravessam", () => {
    // Zero é o caso que importa: um `0` lido de banco, de um `JSON.parse` ou de um `Number("")` chegaria
    // ao payload como "informado", e o GI gravaria horista sem horas sem nada falhar.
    for (const lixo of [0, -40, Number.NaN, "abc", "", null]) {
      const f = montarCheio({
        ...CONTRATACAO_CHEIA,
        qtdeHorasMes: lixo as unknown as number,
        qtdeHorasSem: lixo as unknown as number,
      });
      expect(f.qtdeHorasMes, `qtdeHorasMes aceitou ${String(lixo)}`).toBeNull();
      expect(f.qtdeHorasSem, `qtdeHorasSem aceitou ${String(lixo)}`).toBeNull();
    }
  });

  it("o TETO FISICO barra o digito a mais: 744 no mes e 168 na semana", () => {
    // O teto é FÍSICO (31x24 e 7x24), não trabalhista, porque jornada acima da CLT é legítima em regime
    // próprio. O que ele existe para pegar é o 2200 digitado no lugar de 220.
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasMes: 744 }).qtdeHorasMes).toBe(744);
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasMes: 745 }).qtdeHorasMes).toBeNull();
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasMes: 2200 }).qtdeHorasMes).toBeNull();
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasSem: 168 }).qtdeHorasSem).toBe(168);
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasSem: 169 }).qtdeHorasSem).toBeNull();
  });

  it("salarioHora EXISTE no contrato e NAO e emitido: a decisao e do EA, nao do GI", () => {
    // Mesmo padrão do ponto 6 (banco da empresa): tirar o campo do recorte porque "não usamos" falsearia
    // o contrato. Ele existe, tem o mesmo `default 0`, e o EA escolheu não preenchê-lo, porque o contrato
    // não descreve a semântica e escrever remuneração em campo não medido é tão ruim quanto mandar zero.
    expect(NOMES_DO_SCHEMA).toContain("salarioHora");
    expect(montarCheio({ ...CONTRATACAO_CHEIA, qtdeHorasMes: 220, qtdeHorasSem: 44 })).not.toHaveProperty(
      "salarioHora",
    );
  });
});
