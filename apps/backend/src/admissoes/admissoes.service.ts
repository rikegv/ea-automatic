import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import {
  beneficioExigeValor,
  CLICKSIGN_STATUS_LABEL,
  TIPO_MARCACAO_LABEL,
  FAROL_GLOBAL_LABEL,
  isValidCpf,
  ITENS_EPI,
  normalizarColunasRelatorio,
  normalizeCpf,
  type FarolGlobal,
} from "@ea/shared-types";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoConcluidaSql, admissaoEmAndamentoExclusivoSql } from "../db/expressoes-admissao";
import {
  comPendenciaSql,
  condicoesDoFiltro,
  whereDoFiltro,
  type ListarAdmissoesFiltros,
} from "./admissoes-filtros";
import {
  fmtDataHoraRelatorio,
  fmtDataRelatorio,
  gerarXlsxRelatorio,
  nomeArquivoRelatorio,
  numeroDoSalario,
  simNao,
  type LinhaRelatorio,
} from "./relatorio-export";
import {
  beneficiosDoRelatorio,
  frentesDoRelatorio,
  vtDoRelatorio,
} from "./relatorio-agregados";
import {
  clienteLojas,
  admissaoBeneficio,
  admissaoIfractal,
  admissaoProjeto,
  admissoes,
  clienteVinculos,
  clinicasCatalogo,
  entidadesSoulan,
  integracaoAgendamento,
  candidatoAlteracoesLog,
  candidatos,
  cargos,
  projetoGrupoEntrada,
  projetosAltoVolume,
  beneficiosCatalogo,
  clienteBeneficioPadrao,
  clientes,
  dadosVagaFolha,
  documentosAdmissao,
  exameAgendamento,
  tiposDocumento,
  frenteStatusCatalogo,
  frentesAdmissao,
  integracaoPandape,
  motivosDeclinio,
  reguaDocumental,
  usuarios,
} from "../db/schema";
import {
  calcSinalizadorPreenchimento,
  ehFarolVivo,
  STATUS_INICIAL_FRENTE,
} from "../domain/admissao";
import { parseBeneficiosPadrao } from "../domain/beneficios";
import { FRENTES_AO_NASCER } from "../domain/frentes";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { recomputeFarolGlobal } from "./farol";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { FAROIS_VIVOS, pendenciasObrigatorias } from "../domain/admissao";
import {
  pendenciasObrigatoriasPorAdmissao,
  pendenciasObrigatoriasSet,
} from "../regua/pendencias-lote";
import { configDoCliente } from "../regua/pendencia-config.repo";
import { recalcularSinalizadorDaAdmissao } from "../regua/sinalizador.repo";
import {
  filtroClienteOuVinculo,
  preferirVinculo,
  vinculosDoCliente,
} from "../regua/vinculo.repo";
import { exigeEscolhaDeVinculo } from "../domain/vinculo";
import { avisoDivergenciaBancaria, divergenciasReconhecidas } from "../domain/cadastro-bancario";
import type { AuthUser } from "../auth/auth.types";
import type { CandidatoInputDto, CreateAdmissaoDto } from "./dto/create-admissao.dto";
import { carimboDoGrupo } from "./grupo-da-admissao";
import { lojaDaLinhaDoLote, validarLojaDoCliente } from "./loja-da-admissao";
import type { UpdateAdmissaoDto } from "./dto/update-admissao.dto";
import type { AtualizarUniformeDto } from "./dto/atualizar-uniforme.dto";
import { ehCabecalho, ehXlsx, lerPlanilhaMatriculas, lerXlsxMatriculas } from "./matriculas-import";

/**
 * Teto de pré-admissões por lote de liberação (decisão do diretor). Acima disso a chamada é barrada:
 * o lote é síncrono e o consultor espera na tela.
 */
const LOTE_LIBERACAO_MAX = 50;

/**
 * FRENTE A do item 9 (CPF errado do Pandapé): a liberação é a PORTA DE ENTRADA da esteira, e é aqui
 * que o CPF matematicamente inválido é barrado, antes de a admissão nascer e contaminar régua, Drive,
 * kit e envelope de assinatura. O dígito verificador só pega o erro de DIGITAÇÃO; CPF válido que é de
 * OUTRA pessoa passa por aqui (nenhuma conta detecta isso) e é a auditoria do documento que revela,
 * com a correção pela rota de Master (`corrigirCpf`).
 *
 * §A.6: a mensagem NÃO repete o CPF. A tela já o mostra ao lado do nome, e o texto do erro passa por
 * log de falha do lote.
 */
const CPF_INVALIDO_NA_LIBERACAO =
  "CPF inválido: o dígito verificador não fecha. Corrija o CPF antes de liberar esta admissão.";

/** Entrada de uniforme e EPI da liberação (OST Onda 3, item 1). */
interface UniformeEpiInput {
  uniforme?: { possui: boolean; camiseta?: string; calca?: string; bota?: string };
  epi?: { possui: boolean; itens?: string[]; outros?: string };
}

/**
 * Traduz uniforme e EPI para as colunas de `dados_vaga_folha`, aplicando as duas regras de coerência
 * do diretor: responder "não possui" LIMPA o detalhe (tamanho de quem não tem uniforme é lixo que
 * reaparece na ficha), e "Outros" marcado EXIGE o texto do que é (mesma régua do benefício que exige
 * valor: o que foi escolhido tem de ficar completo). Função pura, sem banco.
 */
function colunasUniformeEpi(i: UniformeEpiInput) {
  const temUniforme = i.uniforme?.possui === true;
  const temEpi = i.epi?.possui === true;
  // Ordem canônica do catálogo, sem repetição: a lista gravada não depende da ordem de clique.
  const itens = temEpi
    ? ITENS_EPI.filter((it) => i.epi?.itens?.includes(it))
    : [];
  const outros = i.epi?.outros?.trim() ?? "";
  if (itens.includes("OUTROS") && outros === "") {
    throw new BadRequestException(
      'Marcou "Outros" no EPI: informe qual é o item. Sem isso o aviso da ficha não diz nada a quem for validar.',
    );
  }
  return {
    possuiUniforme: i.uniforme?.possui ?? null,
    uniformeCamiseta: temUniforme ? (i.uniforme?.camiseta ?? null) : null,
    uniformeCalca: temUniforme ? (i.uniforme?.calca ?? null) : null,
    uniformeBota: temUniforme ? (i.uniforme?.bota ?? null) : null,
    possuiEpi: i.epi?.possui ?? null,
    epiItens: itens.length > 0 ? itens.join(",") : null,
    epiOutros: itens.includes("OUTROS") ? outros : null,
  };
}

/** Transação do Drizzle, derivada do próprio `Database` (não depende do dialeto importado). */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Os filtros do Gerenciador moraram aqui até o item 11c; agora vivem junto do montador de condições
// que a lista e o relatório exportável compartilham. Reexportado para não mudar quem já importava.
export type { ListarAdmissoesFiltros };

/**
 * AS COLUNAS QUE O GERENCIADOR ORDENA, lista FECHADA.
 *
 * Fechada por dois motivos que andam juntos: nome de coluna vindo da URL é porta de injeção, e uma
 * URL antiga no favorito de alguém não pode derrubar a tela. O que não está aqui cai na ordem padrão.
 *
 * Só entram colunas que são DADO comparável. As colunas de frente (Auditoria, Exame, Cadastro) ficam
 * de fora porque não vêm desta consulta: elas são carregadas depois, só para as 20 linhas da página, e
 * ordenar a página por elas seria exatamente a ordem falsa que esta frente veio corrigir.
 */
export const COLUNAS_ORDENAVEIS_GERENCIADOR = [
  "candidato",
  "cliente",
  "cargo",
  "contrato",
  "dataAdmissao",
  "status",
] as const;

/**
 * A ORDEM da lista do Gerenciador: o que o usuário pediu, ou a ordem padrão de sempre.
 *
 * A ORDENAÇÃO É NO BANCO porque a tela é PAGINADA no servidor (20 de 2.574, 129 páginas). Ordenar em
 * memória ordenaria só as 20 linhas abertas: a primeira linha da tela não seria a primeira da lista, e
 * ir para a página 2 recomeçaria a sequência do zero. Aqui o `order by` entra antes do `limit`, então
 * a página 1 é o começo real da ordem e a 2 continua de onde a 1 parou.
 *
 * SEM COLUNA ESCOLHIDA, A LISTA SAI IDÊNTICA À DE HOJE (§A.26): a ordem padrão continua
 * `criado_em desc`, byte a byte o que era. A ordenação é sobreposição por ação do usuário, e não uma
 * mudança no comportamento de quem só abre a tela.
 *
 * `criado_em` DESEMPATA sempre, inclusive na ordem pedida: sem ele, duas admissões de mesmo cliente
 * (ou mesma data) poderiam trocar de lugar entre a página 1 e a 2, e a mesma pessoa apareceria duas
 * vezes ou sumiria. Paginação sem desempate estável é assim que se perde linha sem ninguém notar.
 */
function ordemDaLista(ordenarPor?: string, direcao?: "asc" | "desc") {
  const padrao = desc(admissoes.criadoEm);
  if (!ordenarPor) return [padrao];
  const coluna = {
    candidato: candidatos.nome,
    // O cliente é lido na tela pelo nome de operação, com a razão social como reserva: a ordem segue
    // o que está escrito na célula, e não o código, que a coluna não mostra.
    cliente: sql`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial}, ${admissoes.codCliente})`,
    cargo: cargos.nome,
    contrato: admissoes.tipoContrato,
    dataAdmissao: admissoes.dataAdmissao,
    status: admissoes.farolGlobal,
  }[ordenarPor];
  if (!coluna) return [padrao];
  return [direcao === "asc" ? asc(coluna) : desc(coluna), padrao];
}

/**
 * TETO DO RELATÓRIO EXPORTÁVEL (item 11c). Acima disso a exportação recusa com recado, em vez de
 * cortar em silêncio: arquivo truncado sem aviso é pior que arquivo nenhum. A base inteira de hoje
 * (pouco mais de 2 mil admissões) cabe folgada.
 */
const TETO_LINHAS_RELATORIO = 20000;

/**
 * DOIS APELIDOS DA MESMA TABELA `usuarios` no relatório exportável.
 *
 * A linha tem DUAS pessoas diferentes: o consultor que GEROU a admissão e o consultor que conduz a
 * INTEGRAÇÃO. Sem apelido, o segundo `leftJoin` em `usuarios` colidiria com o primeiro e o Postgres
 * recusaria a consulta. (O responsável de cada frente é uma terceira pessoa e vive no agregado das
 * frentes, que faz o seu próprio join.)
 */
const consultorAdmissao = alias(usuarios, "consultor_admissao");
const consultorIntegracao = alias(usuarios, "consultor_integracao");

/**
 * Rótulos de enum que só o relatório precisa escrever por extenso. Escrever o código cru
 * ("AGUARDANDO_CALCULO") numa planilha que a diretoria abre é entregar trabalho pela metade.
 * §A.24: são TAGS, então title case.
 */
const ROTULO_STATUS_BENEFICIO: Record<string, string> = {
  PENDENTE: "Pendente",
  CADASTRADO: "Cadastrado",
  AGUARDANDO_CALCULO: "Aguardando Cálculo",
  BENEFICIO_CALCULADO: "Benefício Calculado",
  FINALIZADO: "Finalizado",
};

const ROTULO_SINALIZADOR: Record<string, string> = {
  PENDENTE: "Pendente",
  PARCIAL: "Parcial",
  OK: "Completo",
  INCONFORMIDADE: "Inconformidade",
  COMPETENCIAS: "Competências",
};

/**
 * Opções de criação por origem (Fase 5 / INT-1). A sync do Pandapé reusa `create` SEM duplicar
 * lógica: marca `origem`, anexa a linha de IntegraçãoPandapé na MESMA transação e desativa o
 * bloqueio por aceite (regra 5 — não-bloqueio: a sync não pode travar por campos pendentes).
 */
export interface CreateAdmissaoOpts {
  origem?: "MANUAL" | "PANDAPE";
  bypassAceite?: boolean;
  pandape?: { idPrecollaborator: string; idMatch?: string; idVacancy?: string; etapa?: string };
}

/**
 * Executor de consulta: o `db` ou a transação em curso. A transação do Drizzle não é atribuível a
 * `Database`, então extraímos o tipo do callback de `transaction` em vez de duplicar a assinatura.
 */
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** numeric do driver ("500.00") no formato que o consultor lê e digita ("500,00"). */
function fmtValorBr(valor: string): string {
  return String(valor).replace(".", ",");
}

@Injectable()
export class AdmissoesService {
  private readonly logger = new Logger("AdmissoesService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    // OPCIONAL de propósito: o pull do Pandapé é efeito colateral da liberação, não parte do núcleo.
    // Scripts de carga e testes constroem o service sem fila, e a liberação segue funcionando igual
    // (sem fila, o pull simplesmente não é enfileirado e a liberação não é afetada).
    @Optional() private readonly pandapeQueue?: PandapeQueueService,
    // OPCIONAL pelo mesmo motivo da fila: os scripts de carga e os testes constroem este service
    // com `new AdmissoesService(db)`, e exigir a régua no construtor quebraria todos eles de uma
    // vez. Sem ela, a única coisa que muda é a coluna "Documentos Obrigatórios Pendentes" do
    // relatório, que sai vazia; nada mais no service a consulta.
    @Optional() private readonly reguaCompletude?: ReguaCompletudeService,
  ) {}

  /**
   * PULL DE DOCUMENTOS NA LIBERAÇÃO (§A.9). A admissão acabou de ganhar cliente + cargo, logo ganhou
   * régua, logo cada documento do Pandapé tem onde encaixar. Enfileira o pull do acervo que o
   * candidato JÁ anexou (inclusive o que ele mandou enquanto esperava a liberação).
   *
   * TRAVA DE COMPORTAMENTO: isto é EFEITO COLATERAL, nunca gate. Roda **depois** da transação de
   * liberação, é `try/catch` de ponta a ponta e é ENFILEIRADO (não chamado direto), então Pandapé
   * fora, Redis fora ou timeout **não revertem nem travam a liberação**. Sem origem Pandapé (admissão
   * manual), é no-op silencioso.
   */
  private async enfileirarPullDocumentos(admissaoId: string): Promise<void> {
    try {
      const integracao = await this.db.query.integracaoPandape.findFirst({
        where: eq(integracaoPandape.admissaoId, admissaoId),
      });
      if (!integracao?.idPrecollaborator) return; // não veio do Pandapé: nada a puxar.
      if (!this.pandapeQueue) return; // sem fila injetada (script/teste): nada a enfileirar.
      const ok = await this.pandapeQueue.enfileirarPullDocumentos(
        admissaoId,
        integracao.idPrecollaborator,
      );
      if (!ok) {
        // §A.6: só ids técnicos, nunca PII. Serve para reprocessar depois.
        this.logger.warn(
          `Pull de documentos NÃO enfileirado (fila indisponível) para a admissão ${admissaoId}. ` +
            "A liberação foi concluída normalmente.",
        );
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao enfileirar o pull de documentos (liberação NÃO afetada): ${
          err instanceof Error ? err.message : "erro"
        }`,
      );
    }
  }

  /**
   * F11 / regra 6 — lookup em tempo real do candidato por CPF. NUNCA 404 (consulta, não recurso):
   * candidato ausente devolve {candidato:null, admissoes:0}. O CPF não é logado (§A.6).
   */
  async lookupCandidato(cpfRaw: string) {
    const cpf = normalizeCpf(cpfRaw);
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, cpf),
    });
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(admissoes)
      .where(eq(admissoes.candidatoCpf, cpf));

    if (!candidato) {
      return { candidato: null, admissoes: 0 };
    }
    return {
      candidato: {
        cpf: candidato.cpf,
        nome: candidato.nome,
        email: candidato.email,
        telefone: candidato.telefone,
      },
      admissoes: total,
    };
  }

  /** F6 — cria a admissão e seus filhos numa transação (nascimento paralelo das frentes — regra 1). */
  async create(dto: CreateAdmissaoDto, user?: AuthUser, opts?: CreateAdmissaoOpts) {
    // a. validação de CPF (F3) — chave técnica de identidade.
    const cpf = normalizeCpf(dto.candidato.cpf);
    if (!isValidCpf(cpf)) {
      throw new BadRequestException("CPF inválido");
    }

    // Valor obrigatório nos benefícios que têm valor. Antes da transação: erro de payload não
    // deve abrir transação nem criar nada.
    await this.validarValoresDoPacote(dto.pacoteBeneficios);

    // LOJA do cliente (etapa 3): a chave estrangeira garante que a loja existe, não que ela seja
    // DESTE cliente. Validado antes da transação, pelo mesmo motivo da linha acima.
    await validarLojaDoCliente(this.db, dto.codCliente, dto.lojaId);

    // GRUPO (cenário 2, etapa 3): carimbo derivado do cliente AGORA, no nascimento. Lido fora da
    // transação pelo mesmo motivo da loja acima, e por um ponto só (`carimboDoGrupo`). Este caminho
    // serve o wizard E o Pandapé quando o de/para resolve cliente, porque os dois entram por aqui.
    const grupoClienteIdCriacao = await carimboDoGrupo(this.db, dto.codCliente);

    // a.1 W6 — campos obrigatórios. NÃO impede (F4/regra 5), mas exige ACEITE EXPLÍCITO quando há
    // pendências. O log permanente do aceite por passagem é da esteira (S3, marco 3).
    const vf = dto.vagaFolha ?? {};
    // OS ITENS COMPARTILHADOS saem da MESMA régua da esteira, respeitando a config por cliente (OST
    // da obrigatoriedade por cliente). Antes esta lista era escrita à mão aqui, e por isso o wizard
    // cobrava item que a esteira já não cobrava: desligar Centro de custo para um cliente valia na
    // esteira e não na criação. Agora vale nos quatro pontos.
    //
    // Os itens ABAIXO (Tempo de contrato, Data de nascimento, Telefone, E-mail, substituído) são
    // exclusivos do aceite de CRIAÇÃO (W6) e não fazem parte da régua de pendências obrigatórias,
    // então seguem cobrados como sempre foram e NÃO aparecem na tela de configuração.
    const configCliente = await configDoCliente(this.db, dto.codCliente);
    const pend: string[] = pendenciasObrigatorias(
      {
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato,
        vagaFolha: {
          salario: vf.salario,
          beneficios: vf.beneficios,
          escala: vf.escala,
          centroCusto: vf.centroCusto,
          setor: vf.setor,
          gestorBp: vf.gestorBp,
        },
        // A criação não marca banco (o `is_banco` é definido depois, na esteira), então aqui a régua
        // cobra a Data de admissão, nunca o Termo. É o comportamento que já existia.
        isBanco: false,
        temBeneficioEstruturado: Boolean(dto.pacoteBeneficios?.length),
      },
      configCliente,
    );
    if (!vf.tempoContrato) pend.push("Tempo de contrato");
    if (!dto.candidato.dataNascimento) pend.push("Data de nascimento");
    if (!dto.candidato.telefone) pend.push("Telefone");
    if (!dto.candidato.email) pend.push("E-mail");
    if (vf.motivo === "Substituição") {
      if (!vf.substituidoNome) pend.push("Nome do substituído");
      if (!vf.substituidoCpf) pend.push("CPF do substituído");
    }
    if (pend.length > 0 && !dto.aceitePendencias && !opts?.bypassAceite) {
      throw new ConflictException({
        needsAceite: true,
        camposPendentes: pend,
        message: "Campos obrigatórios pendentes — aceite explícito necessário (F4).",
      });
    }
    // CPF do substituído, se informado, deve ser válido (dado pessoal — minimização).
    const substituidoCpf = vf.substituidoCpf ? normalizeCpf(vf.substituidoCpf) : null;
    if (substituidoCpf && !isValidCpf(substituidoCpf)) {
      throw new BadRequestException("CPF do substituído inválido");
    }

    // ALTO VOLUME (onda 2) pelo WIZARD. MESMO validador da liberação, fora da transação, e mesma
    // saída curta: sem flag devolve `null` e a criação segue idêntica à de sempre. O wizard não passa
    // pelo `aplicarLiberacao`, então o insert precisa existir aqui também; é o preço de a admissão
    // ter duas portas de nascimento, e cobrir as duas agora é decisão do diretor.
    const vinculoProjeto = await this.resolverVinculoDeProjeto(
      dto.codCliente,
      dto.projetoId,
      dto.grupoEntradaId,
    );

    const resultado = await this.db.transaction(async (tx) => {
      // b. cliente e cargo precisam existir.
      const cliente = await tx.query.clientes.findFirst({
        where: eq(clientes.codCliente, dto.codCliente),
      });
      if (!cliente) throw new NotFoundException("Cliente não encontrado");

      const cargo = await tx.query.cargos.findFirst({ where: eq(cargos.id, dto.cargoId) });
      if (!cargo) throw new NotFoundException("Cargo não encontrado");

      // c. candidato: insere por CPF, preservando o existente (regra 6 — histórico).
      await tx
        .insert(candidatos)
        .values({
          cpf,
          nome: dto.candidato.nome,
          email: dto.candidato.email ?? null,
          telefone: dto.candidato.telefone ?? null,
          dataNascimento: dto.candidato.dataNascimento ?? null,
          sexo: dto.candidato.sexo ?? null,
        })
        .onConflictDoNothing({ target: candidatos.cpf });
      // Preserva o candidato existente (regra 6); só COMPLETA o sexo quando ainda está vazio (o
      // Reservista da régua padrão depende dele). Não sobrescreve um sexo já informado.
      if (dto.candidato.sexo) {
        await tx
          .update(candidatos)
          .set({ sexo: dto.candidato.sexo })
          .where(and(eq(candidatos.cpf, cpf), isNull(candidatos.sexo)));
      }

      // d. régua do par (cliente + cargo) — define os documentos exigidos (regra 4).
      const regua = await tx
        .select({
          tipoDocumentoId: reguaDocumental.tipoDocumentoId,
          exigencia: reguaDocumental.exigencia,
        })
        .from(reguaDocumental)
        .where(
          and(
            eq(reguaDocumental.codCliente, dto.codCliente),
            eq(reguaDocumental.cargoId, dto.cargoId),
          ),
        );

      // e. sinalizador de preenchimento (F5) — marca, nunca bloqueia (regra 5).
      // Régua UNIFICADA: o sinalizador deriva das pendências obrigatórias, então a coluna do
      // Gerenciador, o KPI, o radar e o modal passam a dizer a mesma coisa. Admissão nova nasce
      // VIVA (EM_ADMISSAO), então sempre segue a régua nova.
      const sinalizadorPreenchimento = calcSinalizadorPreenchimento({
        candidato: { nome: dto.candidato.nome, cpf },
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato,
        vagaFolha: {
          salario: vf.salario,
          beneficios: vf.beneficios,
          escala: vf.escala,
          centroCusto: vf.centroCusto,
          setor: vf.setor,
          gestorBp: vf.gestorBp,
        },
        temBeneficioEstruturado: Boolean(dto.pacoteBeneficios?.length),
      });

      // f. admissão (entidade central).
      const [admissao] = await tx
        .insert(admissoes)
        .values({
          candidatoCpf: cpf,
          codCliente: dto.codCliente,
          cargoId: dto.cargoId,
          // LOJA (cenário 1, etapa 3): só existe quando o cliente tem lojas cadastradas. Já validada
          // acima contra o cliente desta admissão (`validarLojaDoCliente`).
          lojaId: dto.lojaId ?? null,
          // GRUPO (cenário 2, etapa 3): o grupo da ÉPOCA. Null quando o cliente não é membro, que é
          // o caso da maioria e não é pendência.
          grupoClienteId: grupoClienteIdCriacao,
          tipoContrato: dto.tipoContrato ?? null,
          dataAdmissao: dto.dataAdmissao ?? null,
          // Consultor que gerou a admissão (Fase 2C) — base da atribuição de NC (Via 1).
          consultorId: user?.id ?? null,
          sinalizadorPreenchimento,
          origem: opts?.origem ?? "MANUAL",
          // idVacancy desnormalizado só quando vem do Pandapé (dedup/unique parcial). Manual = null,
          // então o unique parcial nunca barra digitação no wizard.
          idVacancy: opts?.pandape?.idVacancy ?? null,
        })
        .returning({ id: admissoes.id });

      const admissaoId = admissao.id;

      // f.1 IntegraçãoPandapé (anexo opcional) — na MESMA transação, só quando a admissão veio do
      // Pandapé (Fase 5 / INT-1). Não persistir URLs do Pandapé aqui (§A.6): só os IDs e a etapa.
      if (opts?.pandape) {
        await tx.insert(integracaoPandape).values({
          admissaoId,
          idPrecollaborator: opts.pandape.idPrecollaborator,
          idMatch: opts.pandape.idMatch,
          idVacancy: opts.pandape.idVacancy,
          etapa: opts.pandape.etapa,
        });
      }

      // g. dados de vaga/folha (1:1). Substituição (W2): CPF do substituído com TTL 48h — o relógio
      // dispara na assinatura do contrato (futuro); por ora marca expurgo em now+48h (placeholder
      // documentado), e o job de expurgo nula o CPF ao vencer (§A.6 — minimização/descarte).
      const ehSubstituicao = vf.motivo === "Substituição" && Boolean(substituidoCpf);
      await tx.insert(dadosVagaFolha).values({
        admissaoId,
        salario: vf.salario ?? null,
        beneficios: vf.beneficios ?? null,
        escala: vf.escala ?? null,
        centroCusto: vf.centroCusto ?? null,
        setor: vf.setor ?? null,
        departamento: vf.departamento ?? null,
        gestorBp: vf.gestorBp ?? null,
        motivo: vf.motivo ?? null,
        tempoContrato: vf.tempoContrato ?? null,
        endereco: vf.endereco ?? null,
        substituidoNome: ehSubstituicao ? (vf.substituidoNome ?? null) : null,
        substituidoCpf: ehSubstituicao ? substituidoCpf : null,
        substituicaoExpurgarEm: ehSubstituicao ? new Date(Date.now() + 48 * 60 * 60 * 1000) : null,
      });

      // g.2 pacote de benefícios ESTRUTURADO (§A.17 etapa 4). Admissão nova grava aqui; a string
      // `dados_vaga_folha.beneficios` fica nula e continua existindo só para as importadas.
      if (dto.pacoteBeneficios?.length) {
        await tx.insert(admissaoBeneficio).values(
          dto.pacoteBeneficios.map((b) => ({
            admissaoId,
            beneficioId: b.beneficioId,
            valor: b.valor === undefined ? null : b.valor.toFixed(2),
          })),
        );
      }

      // h. nascimento paralelo (regra 1 / F12): AUDITORIA + EXAME. CADASTRO_CONTRATO não nasce (regra 3).
      const agora = new Date();
      await tx.insert(frentesAdmissao).values(
        FRENTES_AO_NASCER.map((tipo) => ({
          admissaoId,
          tipo,
          status: STATUS_INICIAL_FRENTE[tipo],
          concluida: false,
          dataInicio: agora,
        })),
      );

      // i. documentos exigidos (OBRIGATORIO/FACULTATIVO) em estado PENDENTE; NAO_OBRIGATORIO é pulado.
      const exigidos = regua.filter(
        (r) => r.exigencia === "OBRIGATORIO" || r.exigencia === "FACULTATIVO",
      );
      if (exigidos.length > 0) {
        await tx.insert(documentosAdmissao).values(
          exigidos.map((r) => ({
            admissaoId,
            tipoDocumentoId: r.tipoDocumentoId,
            estado: "PENDENTE" as const,
          })),
        );
      }

      // j. ALTO VOLUME (onda 2): o vínculo com o projeto, quando o wizard marcou o flag. Dentro da
      // MESMA transação da admissão, pelo mesmo motivo do miolo da liberação: os dois nascem juntos
      // ou nenhum nasce. Sem flag, `vinculoProjeto` é nulo e nada acontece aqui.
      //
      // Origem LIBERACAO, e não uma origem própria de wizard: o enum separa o vínculo que nasceu NO
      // ATO (o caminho normal, seja pela Liberação ou pelo wizard) do conserto POSTERIOR (CORRECAO).
      // O wizard é ato de entrada, então é LIBERACAO. Criar um terceiro valor exigiria migração e
      // mexer no enum da onda 1, que já está validado.
      if (vinculoProjeto) {
        await tx.insert(admissaoProjeto).values({
          admissaoId,
          projetoId: vinculoProjeto.projetoId,
          grupoId: vinculoProjeto.grupoId,
          origem: "LIBERACAO",
          vinculadoPorId: user?.id ?? null,
        });
      }

      return {
        admissaoId,
        sinalizadorPreenchimento,
        frentes: [...FRENTES_AO_NASCER],
        documentos: exigidos.length,
      };
    });

    // j. VR/AM viram PADRÃO do cliente (item 4): pré-preenchem a próxima admissão. Best-effort FORA
    // da transação — nunca quebra a criação (envolvido em try/catch). Last write wins por (cliente,
    // benefício). Só valor monetário por cliente, sem PII (§A.6).
    try {
      const padroes = parseBeneficiosPadrao(vf.beneficios);
      for (const p of padroes) {
        await this.db
          .insert(clienteBeneficioPadrao)
          .values({ codCliente: dto.codCliente, beneficio: p.beneficio, valor: p.valor })
          .onConflictDoUpdate({
            // Mesma causa do incidente da régua: a migração do vínculo (0056) trocou o unique
            // simples por um índice PARCIAL (`cliente_vinculo_id IS NULL`), e o Postgres não infere
            // índice parcial sem o predicado. Aqui o efeito não era 500, era pior de perceber: o
            // `catch` best-effort engolia o erro e a MEMÓRIA do pacote por cliente parou de gravar
            // em silêncio. Este é o padrão do cliente inteiro, então o predicado é o do vínculo nulo.
            target: [clienteBeneficioPadrao.codCliente, clienteBeneficioPadrao.beneficio],
            targetWhere: isNull(clienteBeneficioPadrao.clienteVinculoId),
            set: { valor: p.valor, atualizadoEm: new Date() },
          });
      }
    } catch {
      // best-effort: persistir o padrão de benefício nunca invalida uma admissão já criada.
    }

    return resultado;
  }

  /**
   * PRÉ-ADMISSÃO (Liberação Admissional, Parte 1). Cria a admissão do Pandapé em
   * `AGUARDANDO_LIBERACAO`, SEM cliente/cargo — porque o de/para vaga→cliente é manual (§A.9) e adiar
   * calado deixava o candidato invisível. Aqui NÃO nascem régua, frentes nem documentos: eles
   * dependem do par (cliente + cargo) e só nascem na `liberar`. Idempotência pelo unique
   * `idPrecollaborator` (o caller trata a colisão como "já existe").
   *
   * NÃO reusa `create`: aquele exige cliente/cargo (dá 404 sem eles) e faz o nascimento completo.
   */
  async criarPreAdmissao(
    candidato: CandidatoInputDto,
    pandape: NonNullable<CreateAdmissaoOpts["pandape"]>,
    opts?: { possivelDuplicata?: boolean },
  ): Promise<{ admissaoId: string }> {
    const cpf = normalizeCpf(candidato.cpf);
    if (!isValidCpf(cpf)) throw new BadRequestException("CPF inválido");

    return this.db.transaction(async (tx) => {
      // Candidato por CPF, preservando o existente (regra 6). Completa o sexo só se estava vazio.
      await tx
        .insert(candidatos)
        .values({
          cpf,
          nome: candidato.nome,
          email: candidato.email ?? null,
          telefone: candidato.telefone ?? null,
          dataNascimento: candidato.dataNascimento ?? null,
          sexo: candidato.sexo ?? null,
        })
        .onConflictDoNothing({ target: candidatos.cpf });
      if (candidato.sexo) {
        await tx
          .update(candidatos)
          .set({ sexo: candidato.sexo })
          .where(and(eq(candidatos.cpf, cpf), isNull(candidatos.sexo)));
      }

      // Admissão em AGUARDANDO_LIBERACAO, cliente/cargo NULOS. Sinalizador PENDENTE (nada preenchido);
      // não é recomputado enquanto o farol não for vivo (ehFarolVivo), então fica estável.
      const [adm] = await tx
        .insert(admissoes)
        .values({
          candidatoCpf: cpf,
          codCliente: null,
          cargoId: null,
          // GRUPO (cenário 2, etapa 3): NÃO se carimba aqui, e a ausência é deliberada. Esta é a
          // entrada do Pandapé sem de/para: nasce sem cliente, e o grupo deriva do cliente. O
          // carimbo acontece na LIBERAÇÃO, quando o consultor escolhe o cliente. O outro caminho do
          // Pandapé (de/para resolvido) entra pelo `create`, que carimba no nascimento.
          farolGlobal: "AGUARDANDO_LIBERACAO",
          sinalizadorPreenchimento: "PENDENTE",
          origem: "PANDAPE",
          // idVacancy DESNORMALIZADO: chave da dedup e do unique parcial (candidato_cpf + id_vacancy
          // vivo). Se a corrida furar o cheque da trava, o unique parcial rejeita este insert (23505,
          // tratado como "já existe" pelo caller).
          idVacancy: pandape.idVacancy ?? null,
          possivelDuplicata: opts?.possivelDuplicata ?? false,
        })
        .returning({ id: admissoes.id });

      await tx.insert(integracaoPandape).values({
        admissaoId: adm.id,
        idPrecollaborator: pandape.idPrecollaborator,
        idMatch: pandape.idMatch,
        idVacancy: pandape.idVacancy,
        etapa: pandape.etapa,
      });

      // dados_vaga_folha vazio: preserva o 1:1 que o `create` estabelece (todo lugar que a lê usa
      // leftJoin, mas manter a linha evita surpresa). Preenchido depois no lápis/liberação.
      await tx.insert(dadosVagaFolha).values({ admissaoId: adm.id });

      return { admissaoId: adm.id };
    });
  }

  /**
   * DEDUP Pandapé — admissões VIVAS do CPF (não terminais). "Viva" = EM_ADMISSAO / BANCO_AGUARDAR /
   * AGUARDANDO_LIBERACAO (§A.16: declínio/rescisão/concluída são terminais e viram processo NOVO).
   * Devolve o `idVacancy` de cada uma para a trava decidir por (CPF + vaga). Manuais/históricas têm
   * idVacancy nulo (nunca casam por vaga; entram no cálculo do "ambíguo").
   */
  async vivasPorCpf(cpf: string): Promise<{ id: string; idVacancy: string | null }[]> {
    return this.db
      .select({ id: admissoes.id, idVacancy: admissoes.idVacancy })
      .from(admissoes)
      .where(
        and(
          eq(admissoes.candidatoCpf, normalizeCpf(cpf)),
          inArray(admissoes.farolGlobal, ["EM_ADMISSAO", "BANCO_AGUARDAR", "AGUARDANDO_LIBERACAO"]),
        ),
      );
  }

  /**
   * DEDUP Pandapé — o novo evento é a MESMA pessoa+vaga de uma admissão viva já existente (trava B1):
   * "adota" o evento na admissão existente (atualiza os IDs do Pandapé e a etapa) em vez de criar uma
   * duplicata. Se a admissão existente não tiver linha de integração (não deveria, pois só Pandapé tem
   * idVacancy), faz upsert defensivo.
   */
  async adotarEventoPandape(
    admissaoId: string,
    pandape: NonNullable<CreateAdmissaoOpts["pandape"]>,
  ): Promise<void> {
    const [row] = await this.db
      .update(integracaoPandape)
      .set({
        idPrecollaborator: pandape.idPrecollaborator,
        idMatch: pandape.idMatch,
        idVacancy: pandape.idVacancy,
        etapa: pandape.etapa,
        atualizadoEm: new Date(),
      })
      .where(eq(integracaoPandape.admissaoId, admissaoId))
      .returning({ id: integracaoPandape.id });
    if (!row) {
      await this.db.insert(integracaoPandape).values({
        admissaoId,
        idPrecollaborator: pandape.idPrecollaborator,
        idMatch: pandape.idMatch,
        idVacancy: pandape.idVacancy,
        etapa: pandape.etapa,
      });
    }
  }

  /**
   * LIBERAÇÃO (Liberação Admissional, Parte 1). Atribui cliente+cargo à pré-admissão e dispara o
   * MESMO nascimento do `create`: régua do par → documentos PENDENTES → frentes AUDITORIA+EXAME →
   * farol EM_ADMISSAO. A partir daqui a admissão aparece na Esteira e some da sala de espera.
   *
   * Se o par não tiver régua, nasce sem checklist (0 documentos) — sinalizado no retorno (`temRegua`),
   * NUNCA bloqueado (regra 5).
   */
  async liberar(
    admissaoId: string,
    dto: {
      codCliente: string;
      cargoId: string;
      /** LOJA (etapa 3), tipo inline. Ver a nota do Alto Volume: mexeu aqui, mexe nos três. */
      lojaId?: string;
      tipoContrato?: string;
      dataAdmissao?: string;
      vagaFolha?: {
        salario?: string;
        beneficios?: string;
        escala?: string;
        centroCusto?: string;
        setor?: string;
        departamento?: string;
        gestorBp?: string;
        motivo?: string;
        tempoContrato?: string;
        endereco?: string;
      };
      pacoteBeneficios?: { beneficioId: string; valor?: number }[];
      observacaoLiberacao?: string;
      uniforme?: { possui: boolean; camiseta?: string; calca?: string; bota?: string };
      epi?: { possui: boolean; itens?: string[]; outros?: string };
      /** BLOCO 5 (item 7): vínculo escolhido. Só é exigido quando o cliente tem 2 ou mais. */
      clienteVinculoId?: string;
      /**
       * ALTO VOLUME (onda 2), tipo inline 1 de 3. O MESMO par de campos existe no miolo
       * `aplicarLiberacao` e no `liberarEmLote`: o dto da liberação é tipado inline nos três lugares,
       * e um campo que entra em dois deles some EM SILÊNCIO no terceiro, sem erro de compilação,
       * porque o objeto só perde uma propriedade que ninguém declarou. Mexeu aqui, mexe nos três.
       */
      projetoId?: string;
      grupoEntradaId?: string;
      /**
       * SEXO confirmado ou CORRIGIDO na tela (OST do seletor de sexo). Só na liberação INDIVIDUAL: no
       * lote, um mesmo valor valeria para todo mundo da leva, o que é errado por definição.
       */
      sexo?: "MASCULINO" | "FEMININO";
      /**
       * ACEITE do alerta de CPF duplicado (item 3 da OST dos 3 ajustes). Só chega preenchido quando
       * o consultor já viu o 409 com a lista e confirmou que NÃO é duplicata.
       */
      aceiteDuplicidade?: boolean;
    },
    user: AuthUser,
  ): Promise<{ admissaoId: string; temRegua: boolean }> {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (adm.farolGlobal !== "AGUARDANDO_LIBERACAO") {
      throw new ConflictException("Esta admissão não está aguardando liberação.");
    }
    if (!isValidCpf(adm.candidatoCpf)) throw new BadRequestException(CPF_INVALIDO_NA_LIBERACAO);
    await this.travarDuplicidadeDeCpf(adm.id, adm.candidatoCpf, dto.aceiteDuplicidade);
    // UNIFORME (OST Onda 3, item 1): a RESPOSTA é obrigatória para liberar individualmente. Ter
    // uniforme não bloqueia nada; não ter respondido, sim. A trava mora aqui, e NÃO no miolo
    // compartilhado, porque o LOTE segue a regra dos demais campos (o que vai em branco vira
    // pendência individual na esteira, §A.3 regra 5), em vez de travar 50 liberações de uma vez.
    if (typeof dto.uniforme?.possui !== "boolean") {
      throw new BadRequestException(
        "Responda se o candidato possui uniforme antes de liberar. Ter uniforme não bloqueia nada, mas a resposta é obrigatória.",
      );
    }
    const cliente = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, dto.cargoId) });
    if (!cargo) throw new NotFoundException("Cargo não encontrado");

    // LOJA (etapa 3): antes da transação, com as demais validações de entrada. A chave
    // estrangeira garante que a loja existe; esta função garante que ela é DESTE cliente e
    // está ativa.
    await validarLojaDoCliente(this.db, dto.codCliente, dto.lojaId);

    // BLOCO 5 (item 7): o cliente que trabalha com MAIS DE UM contrato exige a escolha de qual. Não
    // é o `tipo_contrato` virando obrigatório para todo mundo: é uma escolha entre opções concretas,
    // no único caso em que ela existe. Cliente de um vínculo (233 dos 234) não é perguntado nada.
    const vinculoId = await this.escolherVinculoDaLiberacao(dto.codCliente, dto.clienteVinculoId);

    // ALTO VOLUME (onda 2): valida o projeto ANTES de abrir a transação, junto das demais validações
    // de entrada. Sem flag devolve `null` na primeira linha e nada aqui muda.
    const vinculoProjeto = await this.resolverVinculoDeProjeto(
      dto.codCliente,
      dto.projetoId,
      dto.grupoEntradaId,
    );

    // Nome do candidato (sempre presente): o sinalizador exige identidade (nome+cpf) para avaliar a
    // régua; sem o nome real ele cairia em PENDENTE mesmo com tudo preenchido.
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });

    // Mesma validação do `create` (benefício que exige valor não passa sem valor). Fora da tx.
    await this.validarValoresDoPacote(dto.pacoteBeneficios);

    const resultado = await this.db.transaction(async (tx) => {
      // SEXO ANTES DE TUDO (OST do seletor de sexo). Grava o que o consultor confirmou ou corrigiu,
      // e grava PRIMEIRO de propósito: a régua e o sinalizador calculados logo abaixo dependem dele
      // (o Reservista só é exigido do sexo masculino). Gravar depois deixaria a admissão nascer com
      // uma pendência que a correção acabou de eliminar.
      if (dto.sexo) {
        await tx
          .update(candidatos)
          .set({ sexo: dto.sexo, atualizadoEm: new Date() })
          .where(eq(candidatos.cpf, adm.candidatoCpf));
      }
      // Régua do par (cliente + cargo), mesma leitura do `create`. No LOTE esta leitura acontece UMA
      // vez, fora do laço (é o mesmo par para todas), e é passada pronta ao miolo.
      const regua = await this.lerReguaDoPar(tx, dto.codCliente, dto.cargoId, vinculoId);
      await this.aplicarLiberacao(tx, {
        adm,
        candidatoNome: candidato?.nome ?? "",
        dto,
        regua,
        user,
        vinculoId,
        vinculoProjeto,
      });
      return { admissaoId, temRegua: regua.length > 0 };
    });

    // Pull do acervo do Pandapé: FORA da transação e sem poder derrubá-la (ver o método).
    await this.enfileirarPullDocumentos(admissaoId);
    return resultado;
  }

  /**
   * TRAVA DE CPF DUPLICADO NA LIBERAÇÃO INDIVIDUAL (item 3 da OST dos 3 ajustes, decisão do diretor).
   *
   * O QUE ELA CONSERTA. O lote já recusava duplicata desde sempre, mas lendo a COLUNA
   * `possivel_duplicata`, que é uma FOTO tirada na entrada do Pandapé (`pandape-sync.service`). A
   * liberação INDIVIDUAL não tinha trava nenhuma: validava dígito do CPF, farol e uniforme, e
   * liberava. A tela mostrava a tag "Possível duplicata" e o botão funcionava do mesmo jeito.
   *
   * POR QUE A CONTA É AO VIVO, e não a coluna. A foto tem dois furos que a coluna nunca fecha:
   * pré-admissão que não veio do Pandapé nunca recebe a marca, e duplicata que nasce DEPOIS da foto
   * deixa a marca em `false` para sempre. Consultando na hora, a resposta é sobre o estado de agora,
   * que é o único que importa no instante de liberar.
   *
   * BLOQUEIO COM ACEITE, e não bloqueio seco. Candidato PODE ter N admissões (§A.3), e uma segunda
   * vaga legítima em outro cliente é caso real, não erro. Bloquear seco impediria trabalho correto;
   * deixar passar calado é o que está acontecendo hoje. O aceite explícito é o mesmo padrão de
   * `needsConfirmation` que a Esteira já usa na reversão de status e na sobreposição de agendamento.
   *
   * NÃO TOCA NO LOTE. Lá a trava por coluna continua exatamente como está, e continua mandando a
   * duplicata para o tratamento individual, que agora é o lugar onde a decisão de fato acontece.
   *
   * §A.6: a mensagem NÃO repete o CPF (é a chave de identidade, e o consultor já o vê na tela). Sai
   * só o contexto de que ele precisa para decidir: cliente, cargo e situação de cada admissão viva.
   */
  private async travarDuplicidadeDeCpf(
    admissaoId: string,
    cpf: string,
    aceite?: boolean,
  ): Promise<void> {
    if (aceite) return;
    const outras = await this.db
      .select({
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoNome: cargos.nome,
        farolGlobal: admissoes.farolGlobal,
      })
      .from(admissoes)
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(
        and(
          eq(admissoes.candidatoCpf, normalizeCpf(cpf)),
          ne(admissoes.id, admissaoId),
          // FAROL VIVO, e nada além dele: admissão concluída ou declinada do passado é HISTÓRICO, e
          // §A.3 regra 6 diz que o reaproveitamento por CPF é o comportamento esperado. Alertar
          // sobre elas viraria ruído em cima de quase toda readmissão.
          inArray(admissoes.farolGlobal, [...FAROIS_VIVOS]),
        ),
      );
    if (outras.length === 0) return;

    throw new ConflictException({
      needsConfirmation: true,
      reason: "cpfDuplicado",
      vivas: outras.map((o) => ({
        cliente: o.clienteOperacao ?? o.clienteRazao ?? "não informado",
        cargo: o.cargoNome ?? "não informado",
        situacao: o.farolGlobal,
      })),
      message:
        outras.length === 1
          ? "Já existe uma admissão em andamento para este CPF. Confirme que não é duplicata antes de liberar."
          : `Já existem ${outras.length} admissões em andamento para este CPF. Confirme que não é duplicata antes de liberar.`,
    });
  }

  /**
   * BLOCO 5 do item 7: qual vínculo (contrato) esta liberação usa?
   *
   * `null` quando o cliente tem 0 ou 1 vínculo, e isso NÃO é omissão: é a regra de ouro do Caminho 2.
   * Com um vínculo só, régua, obrigatoriedade e assinante seguem resolvendo pelo cliente, como
   * sempre resolveram, e nenhuma das 145 admissões vivas muda de comportamento.
   *
   * Com dois ou mais, a escolha passa a ser OBRIGATÓRIA, porque sem ela o sistema não sabe qual
   * régua aplicar, e nascer com o checklist do contrato errado é pior que parar e perguntar.
   */
  private async escolherVinculoDaLiberacao(
    codCliente: string,
    escolhido?: string | null,
  ): Promise<string | null> {
    const vinculos = await vinculosDoCliente(this.db, codCliente);
    if (!exigeEscolhaDeVinculo(vinculos)) return null;
    if (!escolhido) {
      throw new BadRequestException(
        "Este cliente trabalha com mais de um tipo de contrato. Escolha o contrato antes de liberar, " +
          "senão a admissão nasce com a régua documental do contrato errado.",
      );
    }
    if (!vinculos.some((v) => v.id === escolhido)) {
      throw new BadRequestException("O contrato escolhido não pertence a este cliente.");
    }
    return escolhido;
  }

  /**
   * ALTO VOLUME (onda 2): valida o projeto escolhido e devolve o vínculo a gravar, ou `null`.
   *
   * `null` QUANDO NÃO HÁ FLAG, e este é o caminho da esmagadora maioria das liberações: sem
   * `projetoId` a função sai na primeira linha, nada é lido, nada é gravado e a liberação segue
   * exatamente como sempre seguiu. É a mesma forma do `escolherVinculoDaLiberacao`, que devolve
   * `null` para o cliente de um vínculo só.
   *
   * O que ela recusa, e o motivo de recusar em vez de ignorar: projeto de OUTRO cliente (o vínculo
   * mentiria sobre a que operação a pessoa pertence), projeto INATIVO (encerrado não recebe gente
   * nova) e grupo que não é daquele projeto (a leva não existe lá). Em qualquer um dos três, um
   * vínculo torto é pior que uma liberação que para e explica, porque a contagem do projeto passa a
   * mentir e ninguém percebe.
   *
   * Chamada UMA vez por operação, fora da transação: no individual antes de abrir a tx, no lote
   * antes do laço (o projeto é o mesmo para as N, como cliente, cargo e régua).
   */
  private async resolverVinculoDeProjeto(
    codCliente: string,
    projetoId?: string | null,
    grupoEntradaId?: string | null,
  ): Promise<{ projetoId: string; grupoId: string | null } | null> {
    if (!projetoId) return null;

    const projeto = await this.db.query.projetosAltoVolume.findFirst({
      where: eq(projetosAltoVolume.id, projetoId),
    });
    if (!projeto) throw new NotFoundException("Projeto de Alto Volume não encontrado.");
    if (projeto.codCliente !== codCliente) {
      throw new BadRequestException(
        "O projeto de Alto Volume escolhido é de outro cliente. Escolha um projeto deste cliente.",
      );
    }
    if (!projeto.ativo) {
      throw new BadRequestException(
        "Este projeto de Alto Volume está inativo. Reative o projeto ou escolha outro antes de liberar.",
      );
    }

    if (!grupoEntradaId) return { projetoId, grupoId: null };

    const grupo = await this.db.query.projetoGrupoEntrada.findFirst({
      where: eq(projetoGrupoEntrada.id, grupoEntradaId),
    });
    if (!grupo || grupo.projetoId !== projetoId) {
      throw new BadRequestException("O grupo de entrada escolhido não pertence a este projeto.");
    }
    return { projetoId, grupoId: grupoEntradaId };
  }

  /** Régua documental do par (cliente + cargo). Aceita `db` ou `tx` (mesma leitura do `create`). */
  private async lerReguaDoPar(
    exec: Database | DbTransaction,
    codCliente: string,
    cargoId: string,
    vinculoId?: string | null,
  ): Promise<{ tipoDocumentoId: string; exigencia: string }[]> {
    const linhas = await exec
      .select({
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        exigencia: reguaDocumental.exigencia,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
      })
      .from(reguaDocumental)
      .where(
        and(
          eq(reguaDocumental.codCliente, codCliente),
          eq(reguaDocumental.cargoId, cargoId),
          // VÍNCULO (item 7): a régua do contrato escolhido tem precedência sobre a do cliente,
          // documento a documento. Sem vínculo (233 dos 234 clientes), lê exatamente o que lia.
          filtroClienteOuVinculo(reguaDocumental.clienteVinculoId, vinculoId ?? null),
        ),
      );
    return preferirVinculo(linhas, (l) => l.tipoDocumentoId);
  }

  /**
   * MIOLO do nascimento por liberação, dentro de UMA transação já aberta. Extraído do `liberar` para
   * ser reusado, IDÊNTICO, pela liberação em LOTE: sinalizador (régua unificada §A.19) → admissão
   * (cliente/cargo/farol EM_ADMISSAO) → vaga/folha → benefícios estruturados → frentes AUDITORIA+EXAME
   * (regra 1 / F12) → documentos PENDENTES da régua.
   *
   * A régua chega PRONTA (lida uma vez por par) e o chamador é quem decide o que fazer com
   * `regua.length === 0`: o individual deixa nascer sem checklist (regra 5, sinaliza `temRegua`), o
   * lote BARRA antes do laço (decisão do diretor, um par sem régua não nasce 50 vezes sem checklist).
   */
  private async aplicarLiberacao(
    tx: DbTransaction,
    params: {
      adm: typeof admissoes.$inferSelect;
      candidatoNome: string;
      dto: {
        codCliente: string;
        cargoId: string;
        /** LOJA (etapa 3), tipo inline. Mexeu aqui, mexe nos três. */
        lojaId?: string;
        tipoContrato?: string;
        dataAdmissao?: string;
        vagaFolha?: {
          salario?: string;
          beneficios?: string;
          escala?: string;
          centroCusto?: string;
        setor?: string;
          departamento?: string;
          gestorBp?: string;
          motivo?: string;
          tempoContrato?: string;
          endereco?: string;
        };
        pacoteBeneficios?: { beneficioId: string; valor?: number }[];
        observacaoLiberacao?: string;
        uniforme?: { possui: boolean; camiseta?: string; calca?: string; bota?: string };
        epi?: { possui: boolean; itens?: string[]; outros?: string };
        /** ALTO VOLUME (onda 2), tipo inline 2 de 3. Ver a nota no dto do `liberar`. */
        projetoId?: string;
        grupoEntradaId?: string;
      };
      regua: { tipoDocumentoId: string; exigencia: string }[];
      user: AuthUser;
      /** Vínculo escolhido (item 7). `null` = cliente de um vínculo só, resolve como sempre. */
      vinculoId?: string | null;
      /**
       * ALTO VOLUME (onda 2): o vínculo com o projeto, JÁ VALIDADO pelo chamador
       * (`resolverVinculoDeProjeto`). `null` = liberação sem flag, que é o caminho normal.
       *
       * Chega pronto em vez de ser relido do `dto` porque a validação custa duas consultas e o LOTE
       * chamaria este miolo 50 vezes para revalidar o MESMO projeto. Vale a mesma lógica da régua,
       * que também é lida uma vez fora e passada pronta.
       */
      vinculoProjeto?: { projetoId: string; grupoId: string | null } | null;
    },
  ): Promise<void> {
    const {
      adm,
      candidatoNome,
      dto,
      regua,
      user,
      vinculoId = null,
      vinculoProjeto = null,
    } = params;
    const admissaoId = adm.id;
    const vf = dto.vagaFolha ?? {};
    const novoTipoContrato = dto.tipoContrato ?? adm.tipoContrato ?? undefined;
    const novaDataAdmissao = dto.dataAdmissao ?? adm.dataAdmissao ?? undefined;
    const temEstruturado = Boolean(dto.pacoteBeneficios?.length);
    // Observação livre (Bloco 2). Só grava o que tem conteúdo: espaço em branco vira null, para o
    // modal do olho não abrir um bloco vazio. NÃO entra no sinalizador: é opcional por definição.
    // No LOTE este mesmo valor chega igual para as N (o miolo é o mesmo do individual).
    const observacaoLiberacao = dto.observacaoLiberacao?.trim() || null;
    // Uniforme e EPI já normalizados e coerentes (ver `colunasUniformeEpi`). No LOTE os dois vêm
    // ausentes, e o resultado é exatamente o de hoje: colunas nulas, uniforme pendente na esteira.
    const uniformeEpi = colunasUniformeEpi(dto);

    // Sinalizador com os valores REALMENTE preenchidos no modal (régua unificada §A.19): o que
    // ficou vazio vira pendência na esteira, o que foi preenchido não. Mesma função do `create`.
    const sinalizador = calcSinalizadorPreenchimento({
      candidato: { nome: candidatoNome, cpf: adm.candidatoCpf },
      codCliente: dto.codCliente,
      cargoId: dto.cargoId,
      dataAdmissao: novaDataAdmissao,
      tipoContrato: novoTipoContrato,
      vagaFolha: {
        salario: vf.salario,
        beneficios: vf.beneficios,
        escala: vf.escala,
        centroCusto: vf.centroCusto,
        setor: vf.setor,
        gestorBp: vf.gestorBp,
      },
      isBanco: adm.isBanco,
      termoBancoEntregue: false,
      temBeneficioEstruturado: temEstruturado,
      possuiUniforme: uniformeEpi.possuiUniforme,
    });

    // GRUPO (cenário 2, etapa 3): a pré-admissão nasceu SEM cliente, então é aqui que ela ganha o
    // carimbo, no mesmo instante em que o cliente é escrito. Individual e LOTE passam por este
    // miolo, então os dois carimbam sem código repetido. A leitura usa `this.db` pelo mesmo motivo
    // da loja no lote: é uma consulta pequena numa tabela que a transação não toca.
    const grupoClienteIdLiberacao = await carimboDoGrupo(this.db, dto.codCliente);

    await tx
      .update(admissoes)
      .set({
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        grupoClienteId: grupoClienteIdLiberacao,
        // LOJA (etapa 3): no individual vem do seletor; no lote vem do par daquela linha. Já
        // validada contra o cliente antes de a transação abrir.
        lojaId: dto.lojaId ?? null,
        tipoContrato: novoTipoContrato ?? null,
        dataAdmissao: novaDataAdmissao ?? null,
        farolGlobal: "EM_ADMISSAO",
        sinalizadorPreenchimento: sinalizador,
        observacaoLiberacao,
        // PONTEIRO DO VÍNCULO (item 7, Bloco 2): gravado no NASCIMENTO. É ele que faz régua,
        // obrigatoriedade e assinante resolverem pelo contrato certo daí em diante, sem
        // precisar redescobrir o vínculo a cada leitura.
        clienteVinculoId: vinculoId,
        consultorId: user.id,
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, admissaoId));

    // Vaga/folha: a pré-admissão já tem a linha 1:1 (vazia, da criação) — ATUALIZA com o preenchido.
    await tx
      .update(dadosVagaFolha)
      .set({
        salario: vf.salario ?? null,
        escala: vf.escala ?? null,
        centroCusto: vf.centroCusto ?? null,
        setor: vf.setor ?? null,
        departamento: vf.departamento ?? null,
        gestorBp: vf.gestorBp ?? null,
        motivo: vf.motivo ?? null,
        tempoContrato: vf.tempoContrato ?? null,
        endereco: vf.endereco ?? null,
        ...uniformeEpi,
      })
      .where(eq(dadosVagaFolha.admissaoId, admissaoId));

    // Pacote de benefícios ESTRUTURADO (§A.17 etapa 4). Mesma gravação do `create` (g.2).
    if (dto.pacoteBeneficios?.length) {
      await tx.insert(admissaoBeneficio).values(
        dto.pacoteBeneficios.map((b) => ({
          admissaoId,
          beneficioId: b.beneficioId,
          valor: b.valor === undefined ? null : b.valor.toFixed(2),
        })),
      );
    }

    // Nascimento paralelo (regra 1 / F12): AUDITORIA + EXAME. Espelha o `create` (h/i).
    const agora = new Date();
    await tx.insert(frentesAdmissao).values(
      FRENTES_AO_NASCER.map((tipo) => ({
        admissaoId,
        tipo,
        status: STATUS_INICIAL_FRENTE[tipo],
        concluida: false,
        dataInicio: agora,
      })),
    );

    const exigidos = regua.filter(
      (r) => r.exigencia === "OBRIGATORIO" || r.exigencia === "FACULTATIVO",
    );
    if (exigidos.length > 0) {
      await tx.insert(documentosAdmissao).values(
        exigidos.map((r) => ({
          admissaoId,
          tipoDocumentoId: r.tipoDocumentoId,
          estado: "PENDENTE" as const,
        })),
      );
    }

    // ALTO VOLUME (onda 2): o vínculo com o projeto. PONTO ÚNICO DE GRAVAÇÃO, e é por isso que ele
    // mora aqui e não no `liberar`: o individual e o LOTE passam os dois por este miolo, então um
    // insert aqui cobre os dois caminhos sem duplicar regra. Dentro da transação que já existe, de
    // modo que admissão e vínculo nascem juntos ou não nascem.
    //
    // O `if` é a garantia de não-regressão: sem flag não há projeto, não há insert, e a liberação
    // termina exatamente na linha em que terminava antes desta onda.
    if (vinculoProjeto) {
      await tx.insert(admissaoProjeto).values({
        admissaoId,
        projetoId: vinculoProjeto.projetoId,
        grupoId: vinculoProjeto.grupoId,
        // LIBERACAO: nasceu pelo flag, no ato. CORRECAO fica para o conserto posterior (onda 3).
        origem: "LIBERACAO",
        vinculadoPorId: user.id,
      });
    }
  }

  /**
   * LIBERAÇÃO EM LOTE (Liberação Admissional). Aplica os MESMOS valores a N pré-admissões, cada uma
   * nascendo pelo miolo `aplicarLiberacao` (idêntico ao individual).
   *
   * MESMO conjunto de campos do individual, MESMA obrigatoriedade: só cliente+cargo travam. O que vier
   * preenchido é aplicado às N (o caso real é N pessoas do mesmo cliente, cargo e salário); o que vier
   * vazio vira pendência individual de cada admissão na esteira, exatamente como quando o consultor
   * libera uma a uma deixando campos em branco. O pacote de benefícios usa a MESMA régua de valor do
   * individual (`validarValoresDoPacote`), validada uma vez e aplicada às N.
   *
   * PARCIAL-COM-RELATÓRIO: uma transação INDEPENDENTE por admissão. A de número 30 falhar não desfaz
   * as 29 anteriores nem impede as 20 seguintes; a falha volta no relatório. Reprocessar é seguro (a
   * já liberada não está mais em AGUARDANDO_LIBERACAO e cai como falha, sem duplicar nada).
   *
   * BARRAS ANTES DO LAÇO (decisões do diretor): teto de 50 por lote; par sem régua documental não
   * libera em massa (nascer 50 sem checklist é diferente de nascer 1); e pré-admissão marcada
   * "possível duplicata" não entra no lote, é tratada individualmente (aqui vira falha reportada, o
   * front já a bloqueia antes).
   */
  async liberarEmLote(
    admissaoIds: string[],
    dto: {
      codCliente: string;
      cargoId: string;
      /** LOJA (etapa 3), tipo inline. Ver a nota do Alto Volume: mexeu aqui, mexe nos três. */
      lojaId?: string;
      tipoContrato?: string;
      dataAdmissao?: string;
      vagaFolha?: {
        salario?: string;
        beneficios?: string;
        escala?: string;
        centroCusto?: string;
        setor?: string;
        departamento?: string;
        gestorBp?: string;
        motivo?: string;
        tempoContrato?: string;
        endereco?: string;
      };
      pacoteBeneficios?: { beneficioId: string; valor?: number }[];
      observacaoLiberacao?: string;
      /** ALTO VOLUME (onda 2), tipo inline 3 de 3. Ver a nota no dto do `liberar`. */
      projetoId?: string;
      grupoEntradaId?: string;
      /**
       * LOJA POR LINHA (Q9). A única coisa do lote que NÃO é um valor só para todos: o mesmo lote
       * costuma ter gente de lojas diferentes. Admissão fora da lista fica sem loja, como qualquer
       * campo em branco do lote.
       */
      lojasPorAdmissao?: { admissaoId: string; lojaId: string }[];
    },
    user: AuthUser,
  ): Promise<{
    liberadas: { admissaoId: string; candidato: string }[];
    falhas: { candidato: string; motivo: string }[];
  }> {
    const ids = [...new Set(admissaoIds)];
    if (ids.length === 0) throw new BadRequestException("Selecione ao menos uma pré-admissão.");
    if (ids.length > LOTE_LIBERACAO_MAX) {
      throw new BadRequestException(
        `Máximo de ${LOTE_LIBERACAO_MAX} pré-admissões por lote. Selecione menos e repita a operação.`,
      );
    }

    // Cliente e cargo: validados UMA vez (são os mesmos para todas).
    const cliente = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, dto.cargoId) });
    if (!cargo) throw new NotFoundException("Cargo não encontrado");

    // Mesma régua de valor do individual (benefício que exige valor não passa sem valor). O pacote é
    // o mesmo para as N, então valida UMA vez, antes do laço: pacote inválido não libera ninguém.
    await this.validarValoresDoPacote(dto.pacoteBeneficios);

    // Régua do par: lida UMA vez e reaproveitada nas N. Sem régua, o lote NÃO passa (decisão do
    // diretor). O backend é a autoridade: o front bloqueia antes, isto garante que nenhuma chamada
    // direta contorne a regra.
    const regua = await this.lerReguaDoPar(this.db, dto.codCliente, dto.cargoId);
    if (regua.length === 0) {
      throw new ConflictException(
        "Este par de cliente e cargo não tem régua documental cadastrada. Cadastre a régua antes de liberar em massa.",
      );
    }

    // ALTO VOLUME (onda 2): o projeto é o MESMO para as N, então valida UMA vez, antes do laço, na
    // companhia de cliente, cargo e régua. Projeto errado barra o lote inteiro sem liberar ninguém,
    // que é o certo: o consultor escolheu o projeto uma vez, e se ele está errado está errado para
    // todos. Sem flag, devolve `null` e o laço roda como sempre rodou.
    const vinculoProjeto = await this.resolverVinculoDeProjeto(
      dto.codCliente,
      dto.projetoId,
      dto.grupoEntradaId,
    );

    const liberadas: { admissaoId: string; candidato: string }[] = [];
    const falhas: { candidato: string; motivo: string }[] = [];

    for (const admissaoId of ids) {
      // Nome só para o relatório da tela. §A.6: identifica a linha para o consultor, nunca vai a log.
      let nome = "não informado";
      try {
        const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
        if (!adm) throw new NotFoundException("Admissão não encontrada");
        const candidato = await this.db.query.candidatos.findFirst({
          where: eq(candidatos.cpf, adm.candidatoCpf),
        });
        nome = candidato?.nome ?? nome;

        if (adm.farolGlobal !== "AGUARDANDO_LIBERACAO") {
          throw new ConflictException("Não está mais aguardando liberação.");
        }
        if (adm.possivelDuplicata) {
          throw new ConflictException(
            "Possível duplicata: precisa ser liberada individualmente, não em massa.",
          );
        }
        // MESMA trava do individual, por linha: uma pré-admissão com CPF inválido não derruba o lote
        // inteiro, ela falha sozinha e aparece nominalmente no relatório final.
        if (!isValidCpf(adm.candidatoCpf)) throw new BadRequestException(CPF_INVALIDO_NA_LIBERACAO);

        // LOJA POR LINHA (Q9): cada admissão recebe a SUA loja. A validação é por linha e fica
        // DENTRO do try de propósito: loja errada numa pessoa derruba só aquela linha, que aparece
        // nominalmente no relatório final, em vez de abortar o lote inteiro.
        const lojaDaLinha = lojaDaLinhaDoLote(dto.lojasPorAdmissao, admissaoId);
        await validarLojaDoCliente(this.db, dto.codCliente, lojaDaLinha);

        await this.db.transaction(async (tx) => {
          await this.aplicarLiberacao(tx, {
            adm,
            candidatoNome: nome,
            dto: { ...dto, lojaId: lojaDaLinha },
            regua,
            user,
            vinculoProjeto,
          });
        });
        // Um job de pull POR ADMISSÃO: liberar 30 de uma vez enfileira 30 jobs, que o limiter da
        // fila serializa sob o teto do Pandapé, em vez de 30 chamadas simultâneas (§A.5).
        await this.enfileirarPullDocumentos(admissaoId);
        liberadas.push({ admissaoId, candidato: nome });
      } catch (e) {
        // BLOCO 4: o catch NÃO logava nada, então as falhas ficavam sem rastro (o erro morria entre
        // o backend, que não registrava, e a tela, que recebia rótulo genérico). §A.6: loga id
        // técnico + mensagem real, NUNCA nome/CPF (o `nome` fica só no relatório da tela).
        const real = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Falha ao liberar em lote admissao=${admissaoId}: ${real}`);
        falhas.push({
          candidato: nome,
          // Motivo REAL à tela, por admissão (como o motivo da auditoria): HttpException traz a msg
          // amigável; qualquer outro erro traz a mensagem real, não mais "Erro ao liberar" cego.
          // (Salário mal formatado agora é barrado no DTO com 400, nem chega aqui.)
          motivo: e instanceof HttpException ? e.message : real,
        });
      }
    }

    return { liberadas, falhas };
  }

  /**
   * Fila da Liberação Admissional: as pré-admissões em `AGUARDANDO_LIBERACAO`. leftJoin em
   * cliente/cargo (nulos aqui, é a única superfície que os trata nulos). Mostra o que veio do Match
   * (telefone/nascimento/sexo) e a origem/chegada. Ordena por chegada (mais antigo primeiro).
   */
  async listarAguardandoLiberacao() {
    return this.db
      .select({
        admissaoId: admissoes.id,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        telefone: candidatos.telefone,
        dataNascimento: candidatos.dataNascimento,
        sexo: candidatos.sexo,
        origem: admissoes.origem,
        criadoEm: admissoes.criadoEm,
        idVacancy: admissoes.idVacancy,
        possivelDuplicata: admissoes.possivelDuplicata,
        // CLIENTE E CARGO JÁ ATRIBUÍDOS, quando existem. A pré-admissão do Pandapé nasce sem os dois,
        // então o normal é virem nulos; eles só chegam preenchidos quando algo os SUGERIU antes, e
        // hoje esse algo é o match partindo da Sala de Espera. Sem devolvê-los aqui, a sugestão fica
        // gravada no banco e INVISÍVEL na tela, que foi o bug reportado pelo diretor.
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(eq(admissoes.farolGlobal, "AGUARDANDO_LIBERACAO"))
      .orderBy(asc(admissoes.criadoEm));
  }

  /**
   * Liberação Admissional — Parte 2. RECUSA uma pré-admissão (só Master/Super Admin, gate no
   * controller). Farol → LIBERACAO_RECUSADA (terminal), grava quem+quando (SEM motivo, decisão do
   * diretor) e registra na trilha permanente (candidato_alteracoes_log, mesmo padrão do declínio).
   * A admissão sai da fila de aguardando; não vaza em fila/KPI (farol excluído).
   */
  async recusarLiberacao(admissaoId: string, user: AuthUser): Promise<void> {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (adm.farolGlobal !== "AGUARDANDO_LIBERACAO") {
      throw new ConflictException(
        "Só é possível recusar uma admissão que está aguardando liberação.",
      );
    }
    const agora = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({
          farolGlobal: "LIBERACAO_RECUSADA",
          recusadoPorId: user.id,
          recusadoEm: agora,
          atualizadoEm: agora,
        })
        .where(eq(admissoes.id, admissaoId));
      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId,
        campo: "farolGlobal",
        valorAnterior: "AGUARDANDO_LIBERACAO",
        valorNovo: "LIBERACAO_RECUSADA",
        autorId: user.id,
      });
    });
  }

  /**
   * Liberação Admissional — Parte 2. REATIVA uma recusada (só Master/Super Admin): farol volta a
   * AGUARDANDO_LIBERACAO, limpa quem/quando da recusa e registra a reativação na trilha. A admissão
   * volta para a fila de aguardando.
   */
  async reativarRecusada(admissaoId: string, user: AuthUser): Promise<void> {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (adm.farolGlobal !== "LIBERACAO_RECUSADA") {
      throw new ConflictException("Esta admissão não está recusada.");
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({
          farolGlobal: "AGUARDANDO_LIBERACAO",
          recusadoPorId: null,
          recusadoEm: null,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, admissaoId));
      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId,
        campo: "farolGlobal",
        valorAnterior: "LIBERACAO_RECUSADA",
        valorNovo: "AGUARDANDO_LIBERACAO",
        autorId: user.id,
      });
    });
  }

  /**
   * Contagem LEVE de pré-admissões aguardando liberação (Parte 3: badge no menu + polling do popup).
   * Só um count por farol (índice do enum), sem payload — chamado por todos os usuários a cada ~1-2min.
   */
  async contarAguardandoLiberacao(): Promise<{ count: number }> {
    const [row] = await this.db
      .select({ count: count() })
      .from(admissoes)
      .where(eq(admissoes.farolGlobal, "AGUARDANDO_LIBERACAO"));
    return { count: Number(row?.count ?? 0) };
  }

  /** Fila das RECUSADAS (visão "Admissões Recusadas"). Mostra quem recusou + quando (autor + data). */
  async listarRecusadas() {
    return this.db
      .select({
        admissaoId: admissoes.id,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        telefone: candidatos.telefone,
        dataNascimento: candidatos.dataNascimento,
        sexo: candidatos.sexo,
        origem: admissoes.origem,
        criadoEm: admissoes.criadoEm,
        recusadoEm: admissoes.recusadoEm,
        recusadoPor: usuarios.nome,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .leftJoin(usuarios, eq(admissoes.recusadoPorId, usuarios.id))
      .where(eq(admissoes.farolGlobal, "LIBERACAO_RECUSADA"))
      .orderBy(desc(admissoes.recusadoEm));
  }

  /**
   * F10/F7 — Gerenciador: lista paginada de TODAS as admissões com filtros acumulativos + busca
   * global (nome/CPF) + KPIs (total/ativos/concluídos/declinados). "Concluído" = a frente
   * CADASTRO_CONTRATO da admissão está concluída (processo finalizado). Os KPIs aplicam os filtros
   * de cliente/cargo/contrato/sinalizador/período/busca, mas NÃO o farol/concluído (mostram a
   * distribuição e funcionam como botão de filtro). CPF nunca é retornado na lista (só filtra).
   */
  async listar(filtros: ListarAdmissoesFiltros) {
    const page = Math.max(1, Math.floor(filtros.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(filtros.pageSize ?? 20)));

    // O RECORTE VIVE EM `admissoes-filtros` (item 11c): a lista e o RELATÓRIO EXPORTÁVEL chamam a
    // MESMA função, então o arquivo baixado nunca mostra um conjunto diferente do que está na tela.
    // O SQL é o de sempre, byte a byte; só mudou de casa. `base` = filtros de conjunto (os KPIs
    // contam sobre ele, §A.12); `listWhere` = base + filtros de status, que valem só para as linhas.
    const { base, listWhere } = condicoesDoFiltro(filtros);

    // "Concluído" = terminou o Cadastro E NÃO tem integração PENDENTE. A expressão MUDOU DE CASA na
    // onda 4 do Alto Volume (decisão do diretor): vive em `db/expressoes-admissao`, para o painel do
    // projeto contar o mesmo balde que o Gerenciador. O SQL é o mesmo, byte a byte; o motivo de cada
    // metade está documentado lá.
    const concluidoExpr = admissaoConcluidaSql;

    // "Com pendências obrigatórias": ver o comentário completo em `admissoes-filtros`, onde a
    // expressão passou a morar (declínio e pausa nunca contam como pendência em card nenhum).
    const comPendenciaExpr = comPendenciaSql;

    // "Em andamento" = admissão EM ABERTO que ainda NÃO concluiu. Mesma mudança de casa do
    // `concluidoExpr`, pelo mesmo motivo: os dois baldes andam juntos.
    //
    // EXCLUSIVO desde a correção do diretor: o balde deixou de ser só o farol e passou a excluir quem
    // já concluiu, senão a mesma admissão aparecia em "Admissões Em Andamento" E em "Admissões
    // Concluídas" (eram 56). O motivo completo está em `db/expressoes-admissao`.
    const emAndamentoExpr = admissaoEmAndamentoExclusivoSql;

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .where(listWhere.length ? and(...listWhere) : undefined);

    const items = await this.db
      .select({
        admissaoId: admissoes.id,
        candidatoNome: candidatos.nome,
        codCliente: admissoes.codCliente,
        clienteOperacao: clientes.nomeOperacao,
        clienteRazao: clientes.razaoSocial,
        cargoNome: cargos.nome,
        tipoContrato: admissoes.tipoContrato,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
        isBanco: admissoes.isBanco,
        origem: admissoes.origem,
        sinalizador: admissoes.sinalizadorPreenchimento,
        // PAUSA: alimenta a tag "Pausada" na coluna Status do Gerenciador (Bloco 5).
        pausadaEm: admissoes.pausadaEm,
        concluido: concluidoExpr,
        criadoEm: admissoes.criadoEm,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .where(listWhere.length ? and(...listWhere) : undefined)
      .orderBy(...ordemDaLista(filtros.ordenarPor, filtros.direcao))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // G4a — status das 3 frentes por admissão da página (colunas Auditoria/Exame/Cadastro).
    const ids = items.map((i) => i.admissaoId);
    const frentesRows = ids.length
      ? await this.db
          .select({
            admissaoId: frentesAdmissao.admissaoId,
            tipo: frentesAdmissao.tipo,
            status: frentesAdmissao.status,
            concluida: frentesAdmissao.concluida,
          })
          .from(frentesAdmissao)
          .where(inArray(frentesAdmissao.admissaoId, ids))
      : [];
    const catalogo = await this.db
      .select({
        tipo: frenteStatusCatalogo.tipo,
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frenteStatusCatalogo);
    const rotuloDe = (tipo: string, codigo: string) =>
      catalogo.find((c) => c.tipo === tipo && c.codigo === codigo)?.rotulo ?? codigo;
    const frentesPorAdm = new Map<
      string,
      Record<string, { status: string; rotulo: string; concluida: boolean }>
    >();
    for (const f of frentesRows) {
      const m = frentesPorAdm.get(f.admissaoId) ?? {};
      m[f.tipo] = { status: f.status, rotulo: rotuloDe(f.tipo, f.status), concluida: f.concluida };
      frentesPorAdm.set(f.admissaoId, m);
    }
    // PENDÊNCIAS OBRIGATÓRIAS por linha, da FONTE ÚNICA (OST do "Parcial" com zero pendências).
    // A coluna mostrava "Parcial" lendo `sinalizador_preenchimento`, que a auditoria sobrescreve com
    // INCONFORMIDADE quando há documento inconforme; documento inconforme não é pendência de CAMPO,
    // então o pill contradizia o card da MESMA linha. Agora os dois leem o mesmo cálculo.
    const pendSet = await pendenciasObrigatoriasSet(this.db, ids);
    const itemsComFrentes = items.map((i) => ({
      ...i,
      frentes: frentesPorAdm.get(i.admissaoId) ?? {},
      temPendencias: pendSet.has(i.admissaoId),
    }));

    // Valores distintos de tipo de contrato (para o filtro Select).
    const tiposContratoRows = await this.db
      .selectDistinct({ tipo: admissoes.tipoContrato })
      .from(admissoes)
      .where(sql`${admissoes.tipoContrato} is not null and ${admissoes.tipoContrato} <> ''`)
      .orderBy(admissoes.tipoContrato);

    // KPIs sobre o conjunto base (sem farol/concluído).
    const [kpi] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        emAndamento: sql<number>`count(*) filter (where ${emAndamentoExpr})::int`,
        declinados: sql<number>`count(*) filter (where ${admissoes.farolGlobal} IN ('DECLINOU', 'RESCISAO'))::int`,
        concluidos: sql<number>`count(*) filter (where ${concluidoExpr})::int`,
        comPendencias: sql<number>`count(*) filter (where ${comPendenciaExpr})::int`,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .where(base.length ? and(...base) : undefined);

    return {
      items: itemsComFrentes,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tiposContrato: tiposContratoRows.map((r) => r.tipo).filter((t): t is string => Boolean(t)),
      kpis: {
        total: kpi?.total ?? 0,
        emAndamento: kpi?.emAndamento ?? 0,
        concluidos: kpi?.concluidos ?? 0,
        declinados: kpi?.declinados ?? 0,
        comPendencias: kpi?.comPendencias ?? 0,
      },
    };
  }

  /**
   * RELATÓRIO EXPORTÁVEL DE CANDIDATOS (melhorias EAC, item 11c).
   *
   * O consultor marca as colunas que quer e baixa o xlsx do que está na tela. LEITURA PURA: não
   * escreve nada, não recalcula régua, farol nem contagem, e por isso não alcança nenhuma outra
   * superfície (§A.26/§A.27).
   *
   * O RECORTE É O DA TELA, não um novo: os filtros chegam nos mesmos parâmetros do Gerenciador e
   * passam pelo MESMO `condicoesDoFiltro` que a lista usa (inclusive os joins internos, que
   * descartam a pré-admissão sem cliente/cargo exatamente como a lista descarta). O que muda é só a
   * paginação, que aqui não existe: o arquivo leva o conjunto filtrado inteiro, não a página aberta.
   *
   * ORDEM: a mesma da tela, com `id` de desempate. A lista pagina por `criado_em`, e a carga gravou
   * milhares de admissões no mesmo instante; sem o desempate, um conjunto grande sairia com linha
   * repetida e linha faltando, e ninguém confere 2.000 linhas para descobrir isso.
   */
  async exportarRelatorio(filtros: ListarAdmissoesFiltros, colunasPedidas: string[]) {
    const colunas = normalizarColunasRelatorio(colunasPedidas);
    if (!colunas.length) {
      throw new BadRequestException("Marque pelo menos uma coluna para gerar o relatório.");
    }

    const { listWhere } = condicoesDoFiltro(filtros);
    const linhas = await this.db
      .select({
        id: admissoes.id,
        nome: candidatos.nome,
        cpf: candidatos.cpf,
        telefone: candidatos.telefone,
        email: candidatos.email,
        dataNascimento: candidatos.dataNascimento,
        sexo: candidatos.sexo,
        codCliente: admissoes.codCliente,
        clienteOperacao: clientes.nomeOperacao,
        clienteRazao: clientes.razaoSocial,
        cargo: cargos.nome,
        tipoContrato: admissoes.tipoContrato,
        matricula: admissoes.matricula,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
        pausadaEm: admissoes.pausadaEm,
        origem: admissoes.origem,
        criadoEm: admissoes.criadoEm,
        salario: dadosVagaFolha.salario,
        beneficios: dadosVagaFolha.beneficios,
        escala: dadosVagaFolha.escala,
        setor: dadosVagaFolha.setor,
        departamento: dadosVagaFolha.departamento,
        centroCusto: dadosVagaFolha.centroCusto,
        gestorBp: dadosVagaFolha.gestorBp,
        motivo: dadosVagaFolha.motivo,
        tempoContrato: dadosVagaFolha.tempoContrato,
        endereco: dadosVagaFolha.endereco,
        // ── Uniforme e EPI ──────────────────────────────────────────────────
        possuiUniforme: dadosVagaFolha.possuiUniforme,
        uniformeCamiseta: dadosVagaFolha.uniformeCamiseta,
        uniformeCalca: dadosVagaFolha.uniformeCalca,
        uniformeBota: dadosVagaFolha.uniformeBota,
        possuiEpi: dadosVagaFolha.possuiEpi,
        epiItens: dadosVagaFolha.epiItens,
        epiOutros: dadosVagaFolha.epiOutros,
        // ── Substituição (SEM o CPF do substituído, §A.3 regra 10) ──────────
        substituidoNome: dadosVagaFolha.substituidoNome,
        substituicaoExpurgarEm: dadosVagaFolha.substituicaoExpurgarEm,
        // ── Cliente ─────────────────────────────────────────────────────────
        clienteCnpj: clientes.cnpj,
        clienteEmpresaGrupo: clientes.empresaGrupo,
        clienteRegiao: clientes.regiao,
        clienteDescricaoRegiao: clientes.descricaoRegiao,
        clienteBeneficiosPadrao: clientes.beneficiosPadrao,
        clienteEscalaPadrao: clientes.escalaPadrao,
        clienteEnderecoPadrao: clientes.enderecoPadrao,
        clientePeriodicidadeBeneficio: clientes.periodicidadeBeneficio,
        clienteDiaPagamentoBeneficio: clientes.diaPagamentoBeneficio,
        clienteDiasPrimeiroCredito: clientes.diasPrimeiroCredito,
        // ── iFractal ────────────────────────────────────────────────────────
        // Tipo de marcação HERDADO do cliente (leitura, nunca cópia) e a credencial da tabela
        // própria. O join é 1 para 1 (`unique` em admissao_id), então não multiplica linha.
        ifractalTipoMarcacao: clientes.tipoMarcacao,
        ifractalLogin: admissaoIfractal.login,
        ifractalSenha: admissaoIfractal.senha,
        // ── Vínculo e entidade Soulan ───────────────────────────────────────
        vinculoEmpresaCodigo: clienteVinculos.empresaCodigo,
        vinculoTipoServico: clienteVinculos.tipoServico,
        vinculoFilial: clienteVinculos.filial,
        vinculoFopag: clienteVinculos.isFopag,
        vinculoEntidade: entidadesSoulan.nome,
        vinculoEntidadeCnpj: entidadesSoulan.cnpj,
        // ── Benefícios (o pacote estruturado vem do agregado) ───────────────
        statusCadastroBeneficio: admissoes.statusCadastroBeneficio,
        beneficiosEntrouEm: admissoes.beneficiosEntrouEm,
        // ── Exame ───────────────────────────────────────────────────────────
        exameData: exameAgendamento.data,
        exameHorario: exameAgendamento.horario,
        exameClinicaCatalogo: clinicasCatalogo.nome,
        exameClinicaTexto: exameAgendamento.nomeClinica,
        exameFornecedor: exameAgendamento.fornecedor,
        exameLocal: exameAgendamento.local,
        exameValor: exameAgendamento.valor,
        examePrevisaoAso: exameAgendamento.previsaoAso,
        exameReagendamentos: exameAgendamento.reagendamentos,
        asoValidado: admissoes.asoValidado,
        // ── Integração ──────────────────────────────────────────────────────
        integracaoData: integracaoAgendamento.data,
        integracaoHorario: integracaoAgendamento.horario,
        integracaoTipo: integracaoAgendamento.tipo,
        integracaoConsultor: consultorIntegracao.nome,
        // ── Assinatura ──────────────────────────────────────────────────────
        clicksignStatus: admissoes.clicksignStatus,
        clicksignEnviadoEm: admissoes.clicksignEnviadoEm,
        clicksignNotificadoEm: admissoes.clicksignNotificadoEm,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        contratoAssinadoDriveUrl: admissoes.contratoAssinadoDriveUrl,
        kitAssinaturaEm: admissoes.kitAssinaturaEm,
        // ── Controle ────────────────────────────────────────────────────────
        isBanco: admissoes.isBanco,
        sinalizadorPreenchimento: admissoes.sinalizadorPreenchimento,
        pausaMotivo: admissoes.pausaMotivo,
        motivoDeclinio: motivosDeclinio.nome,
        consultor: consultorAdmissao.nome,
        divergenciaBancaria: admissoes.divergenciaBancaria,
        possivelDuplicata: admissoes.possivelDuplicata,
        observacaoLiberacao: admissoes.observacaoLiberacao,
        recusadoEm: admissoes.recusadoEm,
        idVacancy: admissoes.idVacancy,
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
        atualizadoEm: admissoes.atualizadoEm,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      // TODOS os `leftJoin` abaixo são 1 PARA 1 ou N PARA 1 (o vínculo, a entidade, a clínica, o
      // motivo e os dois usuários são referências da própria linha; exame e integração têm
      // `unique` em `admissao_id`). Nenhum deles multiplica a linha, e é por isso que eles podem
      // vir aqui enquanto frentes, benefícios e VT, que são 1 PARA N, ficam nos agregados.
      .leftJoin(clienteVinculos, eq(clienteVinculos.id, admissoes.clienteVinculoId))
      .leftJoin(entidadesSoulan, eq(entidadesSoulan.id, clienteVinculos.entidadeId))
      .leftJoin(exameAgendamento, eq(exameAgendamento.admissaoId, admissoes.id))
      .leftJoin(clinicasCatalogo, eq(clinicasCatalogo.id, exameAgendamento.clinicaId))
      .leftJoin(integracaoAgendamento, eq(integracaoAgendamento.admissaoId, admissoes.id))
      .leftJoin(consultorIntegracao, eq(consultorIntegracao.id, integracaoAgendamento.consultorId))
      .leftJoin(motivosDeclinio, eq(motivosDeclinio.id, admissoes.motivoDeclinioId))
      .leftJoin(consultorAdmissao, eq(consultorAdmissao.id, admissoes.consultorId))
      .leftJoin(admissaoIfractal, eq(admissaoIfractal.admissaoId, admissoes.id))
      .where(whereDoFiltro(listWhere))
      .orderBy(...ordemDaLista(filtros.ordenarPor, filtros.direcao), asc(admissoes.id))
      .limit(TETO_LINHAS_RELATORIO + 1);

    // TETO EXPLÍCITO, com recado (nada de corte silencioso): passar de 20 mil linhas é sinal de
    // filtro esquecido, e o arquivo mudo levaria o time a trabalhar sobre um recorte que ele não
    // pediu. A base inteira hoje cabe folgada abaixo do teto.
    if (linhas.length > TETO_LINHAS_RELATORIO) {
      throw new BadRequestException(
        `O relatório passaria de ${TETO_LINHAS_RELATORIO} linhas. Refine os filtros da tela e exporte de novo.`,
      );
    }

    /**
     * OS AGREGADOS, e SÓ OS QUE FORAM MARCADOS.
     *
     * Cada bloco 1 PARA N custa uma consulta a mais sobre o conjunto filtrado inteiro, e não faz
     * sentido pagar por ela quando o consultor marcou só nome e telefone. A condição por bloco é o
     * que mantém a exportação de sempre exatamente com o custo de sempre: sem coluna do bloco
     * marcada, a consulta não acontece.
     */
    const ids = linhas.map((l) => l.id);
    const querBloco = (prefixos: string[]) =>
      colunas.some((c) => prefixos.some((p) => c === p || c.startsWith(p)));

    const [frentes, pacoteBeneficios, vt, pendPorAdm, docsPendentes] = await Promise.all([
      querBloco(["frente", "ifractalStatus"])
        ? frentesDoRelatorio(this.db, ids)
        : Promise.resolve(new Map<string, Record<string, { rotulo: string; concluidaEm: Date | null; responsavel: string | null }>>()),
      // A coluna "Benefícios" (grupo Folha) agora É o pacote estruturado, então ela também puxa.
      querBloco(["beneficios"])
        ? beneficiosDoRelatorio(this.db, ids)
        : Promise.resolve(new Map<string, string>()),
      querBloco(["vt"]) ? vtDoRelatorio(this.db, ids) : Promise.resolve(new Map()),
      colunas.includes("pendenciasObrigatorias")
        ? pendenciasObrigatoriasPorAdmissao(this.db, ids)
        : Promise.resolve(new Map<string, string[]>()),
      // Sem a régua injetada (scripts e testes constroem o service sem ela), a coluna sai vazia em
      // vez de derrubar a exportação inteira.
      colunas.includes("docsObrigatoriosPendentes") && this.reguaCompletude
        ? this.reguaCompletude.obrigatoriosPendentesCountMap(ids)
        : Promise.resolve(new Map<string, number>()),
    ]);

    const dados: LinhaRelatorio[] = linhas.map((l) => {
      const f = frentes.get(l.id) ?? {};
      const v = vt.get(l.id);
      return {
        nome: l.nome,
        cpf: l.cpf,
        telefone: l.telefone,
        email: l.email,
        dataNascimento: fmtDataRelatorio(l.dataNascimento),
        sexo: l.sexo === "MASCULINO" ? "Masculino" : l.sexo === "FEMININO" ? "Feminino" : null,
        codCliente: l.codCliente,
        // O cliente sai como está escrito na tela: nome de operação, com a razão social de reserva.
        cliente: l.clienteOperacao || l.clienteRazao,
        cargo: l.cargo,
        tipoContrato: l.tipoContrato,
        matricula: l.matricula,
        dataAdmissao: fmtDataRelatorio(l.dataAdmissao),
        // "Admissão Pausada" é FLAG paralela, não valor do farol, e na tela ela ganha a tag do
        // Status. O relatório repete a leitura da tela, senão a pausada sairia como "Em Admissão".
        status: l.pausadaEm
          ? "Admissão Pausada"
          : (FAROL_GLOBAL_LABEL[l.farolGlobal] ?? l.farolGlobal),
        origem: l.origem === "PANDAPE" ? "Pandapé" : "Manual",
        criadoEm: fmtDataHoraRelatorio(l.criadoEm),
        salario: numeroDoSalario(l.salario),
        // O BENEFÍCIO REAL (§ item 4 da OST): o pacote estruturado, o mesmo da tela de Benefícios.
        // O texto livre legado entra de RESERVA, e não por comodidade: as admissões da carga
        // histórica só têm ele, e trocar a fonte sem reserva esvaziaria a coluna para milhares de
        // linhas que hoje a preenchem. Quem quer o texto legado explicitamente marca a coluna
        // própria dele, no grupo Benefícios.
        beneficios: pacoteBeneficios.get(l.id) ?? l.beneficios,
        escala: l.escala,
        setor: l.setor,
        departamento: l.departamento,
        centroCusto: l.centroCusto,
        gestorBp: l.gestorBp,
        motivo: l.motivo,
        tempoContrato: l.tempoContrato,
        endereco: l.endereco,
        // ── Uniforme e EPI ────────────────────────────────────────────────
        possuiUniforme: simNao(l.possuiUniforme),
        uniformeCamiseta: l.uniformeCamiseta,
        uniformeCalca: l.uniformeCalca,
        uniformeBota: l.uniformeBota,
        possuiEpi: simNao(l.possuiEpi),
        epiItens: l.epiItens,
        epiOutros: l.epiOutros,
        // ── Substituição ──────────────────────────────────────────────────
        substituidoNome: l.substituidoNome,
        substituicaoExpurgarEm: fmtDataHoraRelatorio(l.substituicaoExpurgarEm),
        // ── Cliente ───────────────────────────────────────────────────────
        clienteCnpj: l.clienteCnpj,
        clienteRazaoSocial: l.clienteRazao,
        clienteNomeOperacao: l.clienteOperacao,
        clienteEmpresaGrupo: l.clienteEmpresaGrupo,
        clienteRegiao: l.clienteRegiao,
        clienteDescricaoRegiao: l.clienteDescricaoRegiao,
        clienteBeneficiosPadrao: l.clienteBeneficiosPadrao,
        clienteEscalaPadrao: l.clienteEscalaPadrao,
        clienteEnderecoPadrao: l.clienteEnderecoPadrao,
        clientePeriodicidadeBeneficio: l.clientePeriodicidadeBeneficio,
        clienteDiaPagamentoBeneficio: l.clienteDiaPagamentoBeneficio,
        clienteDiasPrimeiroCredito: l.clienteDiasPrimeiroCredito,
        // ── Vínculo ───────────────────────────────────────────────────────
        vinculoEmpresaCodigo: l.vinculoEmpresaCodigo,
        vinculoTipoServico: l.vinculoTipoServico,
        vinculoFilial: l.vinculoFilial,
        vinculoFopag: simNao(l.vinculoFopag),
        vinculoEntidade: l.vinculoEntidade,
        vinculoEntidadeCnpj: l.vinculoEntidadeCnpj,
        // ── Benefícios ────────────────────────────────────────────────────
        beneficiosTextoLivre: l.beneficios,
        statusCadastroBeneficio: ROTULO_STATUS_BENEFICIO[l.statusCadastroBeneficio] ?? l.statusCadastroBeneficio,
        beneficiosEntrouEm: fmtDataHoraRelatorio(l.beneficiosEntrouEm),
        // ── Frentes ───────────────────────────────────────────────────────
        frenteAuditoria: f.AUDITORIA?.rotulo ?? null,
        frenteAuditoriaConcluidaEm: fmtDataHoraRelatorio(f.AUDITORIA?.concluidaEm),
        frenteAuditoriaResponsavel: f.AUDITORIA?.responsavel ?? null,
        frenteExame: f.EXAME?.rotulo ?? null,
        frenteExameConcluidaEm: fmtDataHoraRelatorio(f.EXAME?.concluidaEm),
        frenteExameResponsavel: f.EXAME?.responsavel ?? null,
        frenteCadastro: f.CADASTRO_CONTRATO?.rotulo ?? null,
        frenteCadastroConcluidaEm: fmtDataHoraRelatorio(f.CADASTRO_CONTRATO?.concluidaEm),
        frenteCadastroResponsavel: f.CADASTRO_CONTRATO?.responsavel ?? null,
        frenteIntegracao: f.INTEGRACAO?.rotulo ?? null,
        frenteIntegracaoConcluidaEm: fmtDataHoraRelatorio(f.INTEGRACAO?.concluidaEm),
        frenteIntegracaoResponsavel: f.INTEGRACAO?.responsavel ?? null,
        // ── Exame ─────────────────────────────────────────────────────────
        exameData: fmtDataRelatorio(l.exameData),
        exameHorario: l.exameHorario,
        // A clínica do CATÁLOGO na frente, com o texto livre de reserva: agendamento antigo só tem
        // o texto, e a clínica inativada continua legível por ele.
        exameClinica: l.exameClinicaCatalogo ?? l.exameClinicaTexto,
        exameFornecedor: l.exameFornecedor,
        exameLocal: l.exameLocal,
        exameValor: numeroDoSalario(l.exameValor),
        examePrevisaoAso: fmtDataRelatorio(l.examePrevisaoAso),
        exameReagendamentos: l.exameReagendamentos,
        asoValidado: simNao(l.asoValidado),
        // ── Integração ────────────────────────────────────────────────────
        integracaoData: fmtDataRelatorio(l.integracaoData),
        integracaoHorario: l.integracaoHorario,
        integracaoTipo:
          l.integracaoTipo === "ONLINE"
            ? "Online"
            : l.integracaoTipo === "PRESENCIAL"
              ? "Presencial"
              : null,
        integracaoConsultor: l.integracaoConsultor,
        // ── Assinatura ────────────────────────────────────────────────────
        clicksignStatus: CLICKSIGN_STATUS_LABEL[l.clicksignStatus] ?? l.clicksignStatus,
        clicksignEnviadoEm: fmtDataHoraRelatorio(l.clicksignEnviadoEm),
        clicksignNotificadoEm: fmtDataHoraRelatorio(l.clicksignNotificadoEm),
        clicksignEnvelopeId: l.clicksignEnvelopeId,
        contratoAssinadoDriveUrl: l.contratoAssinadoDriveUrl,
        kitAssinaturaEm: fmtDataHoraRelatorio(l.kitAssinaturaEm),
        // ── Controle ──────────────────────────────────────────────────────
        isBanco: simNao(l.isBanco),
        sinalizadorPreenchimento:
          ROTULO_SINALIZADOR[l.sinalizadorPreenchimento] ?? l.sinalizadorPreenchimento,
        // A LISTA vem da régua única (`pendenciasObrigatorias`), a mesma do pill do Gerenciador e
        // do modal. Zero pendência sai como célula VAZIA, e não com um texto de "nenhuma": vazio é
        // o que deixa o filtro do Excel separar quem tem de quem não tem (§A.11 também proíbe o
        // travessão como marcador).
        pendenciasObrigatorias: pendPorAdm.get(l.id)?.join("; ") || null,
        docsObrigatoriosPendentes: docsPendentes.get(l.id) ?? null,
        pausadaEm: fmtDataHoraRelatorio(l.pausadaEm),
        pausaMotivo: l.pausaMotivo,
        motivoDeclinio: l.motivoDeclinio,
        consultor: l.consultor,
        divergenciaBancaria: l.divergenciaBancaria,
        possivelDuplicata: simNao(l.possivelDuplicata),
        observacaoLiberacao: l.observacaoLiberacao,
        recusadoEm: fmtDataHoraRelatorio(l.recusadoEm),
        idVacancy: l.idVacancy,
        drivePastaUrl: l.drivePastaUrl,
        driveAsoUrl: l.driveAsoUrl,
        atualizadoEm: fmtDataHoraRelatorio(l.atualizadoEm),
        // ── Formulário de VT ──────────────────────────────────────────────
        vtOptante: simNao(v?.optante),
        vtCep: v?.cep ?? null,
        vtLogradouro: v?.logradouro ?? null,
        vtNumero: v?.numero ?? null,
        vtComplemento: v?.complemento ?? null,
        vtBairro: v?.bairro ?? null,
        vtCidade: v?.cidade ?? null,
        vtUf: v?.uf ?? null,
        vtTotalIda: numeroDoSalario(v?.totalIda),
        vtTotalVolta: numeroDoSalario(v?.totalVolta),
        vtTotalDia: numeroDoSalario(v?.totalDia),
        // ── iFractal ──────────────────────────────────────────────────────
        // O status sai do MESMO agregado de frentes das demais colunas, então o rótulo é o que o
        // catálogo gerenciável diz hoje: renomear um status na tela renomeia na planilha também.
        ifractalLogin: l.ifractalLogin,
        ifractalSenha: l.ifractalSenha,
        ifractalTipoMarcacao: TIPO_MARCACAO_LABEL[l.ifractalTipoMarcacao] ?? l.ifractalTipoMarcacao,
        ifractalStatus: f.IFRACTAL?.rotulo ?? null,
      };
    });

    return {
      buffer: await gerarXlsxRelatorio(colunas, dados),
      nomeArquivo: nomeArquivoRelatorio(new Date()),
      linhas: dados.length,
    };
  }

  /** F10 — campos editáveis de uma admissão (prefill do formulário de edição). */
  async obter(id: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, id),
    });
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });
    // BLOCO 2 (nomes de cliente/cargo p/ exibir) e BLOCO 3 (exame): o lápis mostra, não edita esses.
    // cliente/cargo podem ser nulos numa pré-admissão (AGUARDANDO_LIBERACAO): não consultar com nulo.
    const cliente = adm.codCliente
      ? await this.db.query.clientes.findFirst({ where: eq(clientes.codCliente, adm.codCliente) })
      : undefined;
    const cargo = adm.cargoId
      ? await this.db.query.cargos.findFirst({ where: eq(cargos.id, adm.cargoId) })
      : undefined;
    // LOJA (etapa 3): o modal de edição precisa do id para pré-selecionar o seletor, e o do olho
    // precisa do NOME para exibir. Nula é o caso normal (cliente sem lojas, ou admissão anterior).
    const loja = adm.lojaId
      ? await this.db.query.clienteLojas.findFirst({ where: eq(clienteLojas.id, adm.lojaId) })
      : undefined;
    const agendamento = await this.db.query.exameAgendamento.findFirst({
      where: eq(exameAgendamento.admissaoId, id),
    });
    // BLOCO 4 (status das frentes, só leitura no lápis) e BLOCO 5 (documentos que FALTAM). Mesmo dado
    // do olho, para os dois modais terem o mesmo design de blocos.
    const frentesRows = await this.db
      .select({
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frentesAdmissao)
      .leftJoin(
        frenteStatusCatalogo,
        and(
          eq(frenteStatusCatalogo.tipo, frentesAdmissao.tipo),
          eq(frenteStatusCatalogo.codigo, frentesAdmissao.status),
        ),
      )
      .where(eq(frentesAdmissao.admissaoId, id));
    // Régua só existe com (cliente + cargo): pré-admissão (nulos) não tem checklist ainda.
    const docsRows =
      adm.codCliente && adm.cargoId
        ? await this.db
            .select({
              nome: tiposDocumento.nome,
              exigencia: reguaDocumental.exigencia,
              estado: documentosAdmissao.estado,
            })
            .from(reguaDocumental)
            .innerJoin(tiposDocumento, eq(tiposDocumento.id, reguaDocumental.tipoDocumentoId))
            .leftJoin(
              documentosAdmissao,
              and(
                eq(documentosAdmissao.admissaoId, id),
                eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
              ),
            )
            .where(
              and(
                eq(reguaDocumental.codCliente, adm.codCliente),
                eq(reguaDocumental.cargoId, adm.cargoId),
              ),
            )
            .orderBy(asc(tiposDocumento.nome))
        : [];
    // Pacote ESTRUTURADO (§A.17 etapa 4). O modal de edição decide o modo pelo BLOB legado, não por
    // esta lista: admissão com blob edita o blob (não migramos); sem blob, edita estruturado. Uma
    // admissão nova sem nenhum benefício escolhido tem blob nulo e pacote vazio, e ainda assim é
    // estruturada, que é o comportamento certo.
    const pacote = await this.db
      .select({
        beneficioId: admissaoBeneficio.beneficioId,
        nome: beneficiosCatalogo.nome,
        valor: admissaoBeneficio.valor,
      })
      .from(admissaoBeneficio)
      .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, admissaoBeneficio.beneficioId))
      .where(eq(admissaoBeneficio.admissaoId, id))
      .orderBy(asc(beneficiosCatalogo.nome));

    return {
      admissaoId: adm.id,
      // O par (cliente + cargo) alimenta a sugestão de pacote do modal de pendências (§A.17 etapa 4).
      codCliente: adm.codCliente,
      cargoId: adm.cargoId,
      // LOJA (etapa 3): o id pré-seleciona o seletor no lápis, o nome é o que o olho mostra.
      lojaId: adm.lojaId,
      lojaNome: loja?.nome ?? null,
      // Nomes p/ o BLOCO 2 (exibição; cliente/cargo não são editáveis no lápis — identidade §A.3).
      clienteRazao: cliente?.razaoSocial ?? null,
      clienteOperacao: cliente?.nomeOperacao ?? null,
      cargoNome: cargo?.nome ?? null,
      tipoContrato: adm.tipoContrato,
      dataAdmissao: adm.dataAdmissao,
      matricula: adm.matricula,
      farolGlobal: adm.farolGlobal,
      // Motivo do declínio (mesmo campo que o modal do olho exibe): o modal do lápis o edita quando
      // o farol é de declínio (§A.14, item 3).
      motivoDeclinioId: adm.motivoDeclinioId,
      // PAUSA (OST da pausa, correção): o lápis é onde a pausa é ACIONADA, pelo seletor de status.
      // Precisa do estado atual para derivar o valor exibido e para o motivo já preenchido aparecer.
      pausadaEm: adm.pausadaEm,
      pausaMotivo: adm.pausaMotivo,
      isBanco: adm.isBanco,
      origem: adm.origem,
      // Dados pessoais do candidato (OST — ajuste de escopo): editáveis, exceto o CPF (identidade §A.3).
      candidato: {
        cpf: adm.candidatoCpf,
        nome: candidato?.nome ?? "",
        email: candidato?.email ?? null,
        telefone: candidato?.telefone ?? null,
        dataNascimento: candidato?.dataNascimento ?? null,
        // SEXO: o lápis passou a corrigir, então precisa vir preenchido para não parecer vazio e o
        // consultor não gravar por cima sem querer.
        sexo: candidato?.sexo ?? null,
        // DADOS BANCÁRIOS DIGITADOS pelo candidato no Pandapé (melhorias EAC, item 8). Vêm para o
        // lápis EXIBIR, para o consultor conferir contra o comprovante sem abrir o Pandapé. Os três
        // são opcionais lá, então nulo é caso normal e a tela mostra "não informado".
        banco: candidato?.banco ?? null,
        agencia: candidato?.agencia ?? null,
        conta: candidato?.conta ?? null,
      },
      /**
       * AVISO de divergência bancária (melhorias EAC, item 8), já em texto pronto para a tela. Nulo
       * quando não há divergência, que é o caso normal.
       *
       * O texto é montado no BACKEND de propósito: o dado guardado é rótulo de campo ("agencia"), e
       * transformar rótulo em frase na tela espalharia a mesma regra por cada superfície que
       * mostrasse o aviso. §A.6: o texto diz QUAL campo diverge, nunca o valor de nenhum lado.
       */
      divergenciaBancaria: avisoDivergenciaBancaria(
        divergenciasReconhecidas((adm.divergenciaBancaria ?? "").split(",")),
      ),
      vagaFolha: {
        salario: vaga?.salario ?? null,
        beneficios: vaga?.beneficios ?? null,
        escala: vaga?.escala ?? null,
        centroCusto: vaga?.centroCusto ?? null,
        setor: vaga?.setor ?? null,
        departamento: vaga?.departamento ?? null,
        gestorBp: vaga?.gestorBp ?? null,
        motivo: vaga?.motivo ?? null,
        tempoContrato: vaga?.tempoContrato ?? null,
        endereco: vaga?.endereco ?? null,
      },
      // `beneficiosLegado` é o blob importado: quando presente, o modal edita a string (como hoje).
      beneficiosLegado: vaga?.beneficios ?? null,
      pacoteBeneficios: pacote.map((b) => ({
        beneficioId: b.beneficioId,
        nome: b.nome,
        valor: b.valor === null ? null : Number(b.valor),
      })),
      // BLOCO 3 (Exame): dados do agendamento, SÓ LEITURA no lápis (valor/previsão ASO são editados na
      // tela de agendamento, decisão do diretor). Null = exame ainda não agendado.
      exame: agendamento
        ? {
            data: agendamento.data,
            horario: agendamento.horario,
            nomeClinica: agendamento.nomeClinica,
            local: agendamento.local,
            fornecedor: agendamento.fornecedor,
            valor: agendamento.valor,
            previsaoAso: agendamento.previsaoAso,
          }
        : null,
      // BLOCO 4 (só leitura): status das frentes com rótulo do catálogo.
      frentes: frentesRows.map((f) => ({
        tipo: f.tipo,
        status: f.status,
        rotulo: f.rotulo ?? f.status,
        concluida: f.concluida,
      })),
      // BLOCO 5 (só leitura): documentos que FALTAM (não-entregues).
      documentosPendentes: docsRows
        .filter((d) => (d.estado ?? "PENDENTE") !== "ENTREGUE")
        .map((d) => ({ nome: d.nome, exigencia: d.exigencia, estado: d.estado ?? "PENDENTE" })),
    };
  }

  /**
   * F10 — edita uma admissão (Gerenciador): dados de vaga/folha + contrato/data/matrícula/farol.
   * NÃO altera CPF nem cod_cliente (identidade — §A.3). Recalcula o sinalizador (F5) com os novos
   * valores para a coluna do gerenciador continuar verdadeira.
   */
  /** Idem, mas aceita a transação em curso (para ler o estado recém-gravado). */
  /** Nome do motivo de declínio (para a trilha ser legível). `null` quando não há motivo. */
  private async nomeMotivoDeclinio(exec: Executor, id: string | null): Promise<string | null> {
    if (!id) return null;
    const linhas = await exec
      .select({ nome: motivosDeclinio.nome })
      .from(motivosDeclinio)
      .where(eq(motivosDeclinio.id, id))
      .limit(1);
    return linhas[0]?.nome ?? null;
  }

  private async rotularPacote(exec: Executor, admissaoId: string): Promise<string> {
    const linhas = await exec
      .select({ nome: beneficiosCatalogo.nome, valor: admissaoBeneficio.valor })
      .from(admissaoBeneficio)
      .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, admissaoBeneficio.beneficioId))
      .where(eq(admissaoBeneficio.admissaoId, admissaoId))
      .orderBy(asc(beneficiosCatalogo.nome));
    return linhas
      .map((l) => (l.valor === null ? l.nome : `${l.nome}: ${fmtValorBr(l.valor)}`))
      .join(", ");
  }

  /**
   * MEMÓRIA DO SETOR por (cliente + cargo): os setores DISTINTOS já usados naquele par, do mais
   * recente para o mais antigo.
   *
   * Por que DISTINCT e não "o último", como o pacote de benefícios: o Setor vira menu de opções
   * daquele cliente+cargo (decisão do diretor), e um par real tem mais de um setor legítimo. Devolver
   * só o último transformaria o menu num campo de uma opção só.
   *
   * DERIVADO das admissões, sem tabela de padrão: cada Setor digitado já alimenta a memória por
   * existir, então não há segunda fonte de verdade para dessincronizar (mesma razão do pacote).
   *
   * §A.6: nome de setor é dado de ORGANIZAÇÃO, não da pessoa. Nenhum dado pessoal entra aqui.
   */
  private async setoresDoParClienteCargo(codCliente: string, cargoId: string): Promise<string[]> {
    const linhas = await this.db
      .selectDistinctOn([dadosVagaFolha.setor], {
        setor: dadosVagaFolha.setor,
        criadoEm: admissoes.criadoEm,
      })
      .from(admissoes)
      .innerJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(
        and(
          eq(admissoes.codCliente, codCliente),
          eq(admissoes.cargoId, cargoId),
          isNotNull(dadosVagaFolha.setor),
          ne(dadosVagaFolha.setor, ""),
        ),
      )
      .orderBy(dadosVagaFolha.setor, desc(admissoes.criadoEm));
    return linhas
      .map((l) => l.setor)
      .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /**
   * PARTE C, memória por (cliente + cargo): o ÚLTIMO pacote alocado para aquele par.
   *
   * DERIVADO, sem tabela de padrão: "o último pacote" é lido da admissão mais recente daquele
   * cliente+cargo que tenha alocação estruturada. Assim "cada nova alocação atualiza o padrão" sai
   * de graça e não existe segunda fonte de verdade para dessincronizar (decisão do diretor; o
   * `cliente_beneficio_padrao` que já existe é o contra-exemplo: 2 linhas e valor com lixo).
   *
   * Devolve [] quando o par nunca teve alocação: aí o wizard não sugere nada.
   */
  async pacotePadraoClienteCargo(codCliente: string, cargoId: string) {
    const ultima = await this.db
      .select({ id: admissoes.id })
      .from(admissoes)
      .innerJoin(admissaoBeneficio, eq(admissaoBeneficio.admissaoId, admissoes.id))
      .where(and(eq(admissoes.codCliente, codCliente), eq(admissoes.cargoId, cargoId)))
      .orderBy(desc(admissoes.criadoEm))
      .limit(1);
    // SETORES já usados neste par (OST Onda 2). Vai SEMPRE, inclusive quando o par nunca teve pacote
    // de benefícios: são memórias independentes, e devolver [] de setor só porque não houve benefício
    // esconderia o histórico que o campo precisa para virar menu.
    const setores = await this.setoresDoParClienteCargo(codCliente, cargoId);
    // MEMÓRIA DE UNIFORME E EPI (OST Onda 3, item 1): só o "POSSUI sim/não", nunca o tamanho. Tamanho
    // é da PESSOA (decisão do diretor), e sugerir o do candidato anterior é como o dado errado entra
    // sem ninguém perceber. Independente do pacote, como os setores.
    const uniformeEpi = await this.uniformeEpiDoParClienteCargo(codCliente, cargoId);

    if (ultima.length === 0)
      return {
        beneficios: [] as { beneficioId: string; nome: string; valor: number | null }[],
        setores,
        ...uniformeEpi,
      };

    const linhas = await this.db
      .select({
        beneficioId: admissaoBeneficio.beneficioId,
        nome: beneficiosCatalogo.nome,
        valor: admissaoBeneficio.valor,
      })
      .from(admissaoBeneficio)
      .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, admissaoBeneficio.beneficioId))
      .where(eq(admissaoBeneficio.admissaoId, ultima[0].id))
      .orderBy(asc(beneficiosCatalogo.nome));

    return {
      beneficios: linhas.map((l) => ({
        beneficioId: l.beneficioId,
        nome: l.nome,
        valor: l.valor === null ? null : Number(l.valor),
      })),
      setores,
      ...uniformeEpi,
    };
  }

  /**
   * Última resposta de "possui uniforme?" e "possui EPI?" do par (cliente + cargo). SÓ as flags: o
   * tamanho do uniforme é individual e nunca é sugerido (decisão do diretor).
   *
   * Cada flag vem da admissão MAIS RECENTE que a respondeu, e as duas são independentes: um par pode
   * ter memória de uniforme e nenhuma de EPI. Sem memória, volta `null` e a tela nasce sem resposta,
   * que é o estado que a pendência cobra.
   */
  private async uniformeEpiDoParClienteCargo(
    codCliente: string,
    cargoId: string,
  ): Promise<{ possuiUniforme: boolean | null; possuiEpi: boolean | null }> {
    const linhas = await this.db
      .select({
        possuiUniforme: dadosVagaFolha.possuiUniforme,
        possuiEpi: dadosVagaFolha.possuiEpi,
        criadoEm: admissoes.criadoEm,
      })
      .from(admissoes)
      .innerJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(
        and(
          eq(admissoes.codCliente, codCliente),
          eq(admissoes.cargoId, cargoId),
          or(
            isNotNull(dadosVagaFolha.possuiUniforme),
            isNotNull(dadosVagaFolha.possuiEpi),
          ),
        ),
      )
      .orderBy(desc(admissoes.criadoEm))
      .limit(20);
    return {
      possuiUniforme: linhas.find((l) => l.possuiUniforme !== null)?.possuiUniforme ?? null,
      possuiEpi: linhas.find((l) => l.possuiEpi !== null)?.possuiEpi ?? null,
    };
  }

  /**
   * Valor OBRIGATÓRIO nos benefícios que têm valor (§A.17 etapa 4, decisão do diretor).
   *
   * Se o consultor aloca VR / VA / AM / Cesta básica / PLR / Auxílio creche, ele TEM de dizer
   * quanto. Não fere a regra 5 (não-bloqueio): a regra 5 é sobre criar a admissão com campo-núcleo
   * vazio; aqui, se o benefício não for alocado, nada é exigido. É consistência do que foi
   * escolhido, no mesmo espírito do "cartão OUTRO exige o nome" do formulário de VT.
   *
   * QUEM tem valor vem do CADASTRO (`beneficios_catalogo.exige_valor`), não mais do texto do nome
   * (OST cadastro de benefícios por tela). A tela lê a mesma coluna pelo `/catalogos/beneficios`,
   * então as duas pontas continuam concordando, e agora renomear um benefício NÃO altera a
   * exigência: quem manda é o campo. `beneficioExigeValor` (shared-types) fica só como fallback dos
   * nomes legados, para o caso de uma linha antiga que nunca passou pelo backfill.
   */
  private async validarValoresDoPacote(
    pacote: { beneficioId: string; valor?: number }[] | undefined,
  ): Promise<void> {
    if (!pacote?.length) return;
    const nomes = await this.db
      .select({
        id: beneficiosCatalogo.id,
        nome: beneficiosCatalogo.nome,
        exigeValor: beneficiosCatalogo.exigeValor,
      })
      .from(beneficiosCatalogo)
      .where(
        inArray(
          beneficiosCatalogo.id,
          pacote.map((b) => b.beneficioId),
        ),
      );
    const porId = new Map(nomes.map((n) => [n.id, n]));
    const semValor = pacote
      .filter((b) => {
        const cat = porId.get(b.beneficioId);
        if (!cat) return false;
        const exige = cat.exigeValor ?? beneficioExigeValor(cat.nome);
        return exige && (b.valor === undefined || b.valor === null);
      })
      .map((b) => porId.get(b.beneficioId)!.nome);
    if (semValor.length > 0) {
      throw new BadRequestException(`Informe o valor de: ${semValor.join(", ")}.`);
    }
  }

  /**
   * Termo de Banco ENTREGUE? Só faz sentido em admissão de banco, onde ele substitui a "Data de
   * admissão" na régua de pendências (§A.3). Mesma definição da Esteira: documento em ENTREGUE.
   */
  private async termoBancoEntregue(admissaoId: string): Promise<boolean> {
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "TERMO_BANCO"),
    });
    if (!tipo) return false;
    const [linha] = await this.db
      .select({ id: documentosAdmissao.id })
      .from(documentosAdmissao)
      .where(
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, tipo.id),
          eq(documentosAdmissao.estado, "ENTREGUE"),
        ),
      )
      .limit(1);
    return Boolean(linha);
  }

  /**
   * TROCA O CLIENTE E O CARGO de uma admissão em andamento (OST da correção do cliente errado).
   *
   * O PROBLEMA: o consultor selecionava o cliente errado na criação e não havia como corrigir. A
   * admissão ficava travada na esteira, com régua, pasta do Drive e assinante do cliente errado.
   *
   * CLIENTE E CARGO JUNTOS, por decisão do diretor, e o motivo é estrutural: a régua documental e a
   * memória resolvem por (cliente + cargo). Trocar só o cliente deixaria o par sem régua cadastrada,
   * e a admissão sem checklist nenhum.
   *
   * O RECÁLCULO É QUASE DE GRAÇA, e isso é uma propriedade do desenho do sistema, não sorte: pasta-pai
   * do Drive, assinante da Clicksign, obrigatoriedade por cliente, memória cliente+cargo, régua
   * documental e o vínculo empresa/CNPJ são todos resolvidos POR CONSULTA no momento do uso. Trocar o
   * par já os reaponta. O único ponteiro gravado na admissão é o `clienteVinculoId`, e por isso ele é
   * LIMPO aqui: ele pertence a um vínculo do cliente ANTIGO.
   *
   * O que o sistema NÃO sabe fazer, e por isso existe o aviso: julgar se os documentos já coletados
   * servem para o cliente/cargo novo, e se a régua nova exige outros. Isso é do consultor, e o
   * carimbo `trocaClienteEm` acende o aviso vermelho até ele revisar.
   *
   * TRAVAS: só MASTER/SUPER_ADMIN (no controller) e só ANTES de concluir. Admissão com as três
   * frentes fechadas não troca: a partir dali o processo terminou, e mexer no cliente reescreveria
   * história.
   */
  /**
   * ATUALIZA O UNIFORME depois da liberação (melhoria EAC, item 11b).
   *
   * O PROBLEMA QUE ISTO RESOLVE: os tamanhos eram escritos num lugar só, o `aplicarLiberacao`. Quem
   * errava o tamanho, ou recebia a informação depois (que é o caso comum, porque o candidato mede
   * depois), não tinha por onde corrigir: a admissão ficava com o dado errado até o fim.
   *
   * O BLOCO INTEIRO, E NÃO SÓ OS TRÊS TAMANHOS. `possui` e os tamanhos são um conjunto: o
   * normalizador `colunasUniformeEpi` limpa os tamanhos quando a resposta é "não possui", e é ele que
   * garante que não sobre "camiseta M" em quem respondeu que não tem uniforme. Reusar o normalizador
   * da liberação é o que mantém as duas portas escrevendo a MESMA forma de dado.
   *
   * O SINALIZADOR É REGRAVADO NA MESMA TRANSAÇÃO (§A.27), e não é detalhe: a régua cobra a pendência
   * UNIFORME enquanto a resposta for nula, então responder aqui muda a contagem de pendências. Sem o
   * recálculo, a COLUNA "Pendências Obrig." (régua viva) enxergaria a resposta na hora e o KPI (enum
   * gravado) continuaria dizendo o contrário sobre a MESMA admissão. Usa
   * `recalcularSinalizadorDaAdmissao`, o mesmo do Gerenciador e da tela de Benefícios, e NUNCA o
   * `sinalizadorApenas`, que recalcula com payload parcial e marcaria cinco itens preenchidos como
   * pendentes.
   *
   * TRILHA CAMPO A CAMPO, no mesmo `candidato_alteracoes_log` do Gerenciador: só o que MUDOU vira
   * linha, com quem e quando. §A.6: valores de tamanho e a resposta, sem PII.
   *
   * EPI FICA DE FORA (regra 3): a OST pediu uniforme.
   */
  async atualizarUniforme(id: string, dto: AtualizarUniformeDto, user?: AuthUser) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, id),
    });
    if (!vaga) {
      throw new BadRequestException(
        "Esta admissão ainda não tem dados de vaga. Libere a admissão antes de editar o uniforme.",
      );
    }

    // O MESMO normalizador da liberação, então "não possui" limpa os tamanhos aqui igual a lá. O EPI
    // vai ausente de propósito: `colunasUniformeEpi` devolve as colunas dele zeradas, e por isso elas
    // NÃO entram no `set` abaixo, para esta porta não apagar o EPI que a liberação gravou.
    const cols = colunasUniformeEpi({ uniforme: dto.uniforme });

    await this.db.transaction(async (tx) => {
      const logs: { campo: string; valorAnterior: string | null; valorNovo: string | null }[] = [];
      const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
      const registrar = (campo: string, anterior: unknown, novo: unknown) => {
        const a = str(anterior);
        const n = str(novo);
        if (a !== n) logs.push({ campo, valorAnterior: a, valorNovo: n });
      };
      registrar("possuiUniforme", vaga.possuiUniforme, cols.possuiUniforme);
      registrar("uniformeCamiseta", vaga.uniformeCamiseta, cols.uniformeCamiseta);
      registrar("uniformeCalca", vaga.uniformeCalca, cols.uniformeCalca);
      registrar("uniformeBota", vaga.uniformeBota, cols.uniformeBota);

      await tx
        .update(dadosVagaFolha)
        .set({
          possuiUniforme: cols.possuiUniforme,
          uniformeCamiseta: cols.uniformeCamiseta,
          uniformeCalca: cols.uniformeCalca,
          uniformeBota: cols.uniformeBota,
        })
        .where(eq(dadosVagaFolha.admissaoId, id));

      if (logs.length) {
        await tx.insert(candidatoAlteracoesLog).values(
          logs.map((l) => ({
            admissaoId: id,
            campo: l.campo,
            valorAnterior: l.valorAnterior,
            valorNovo: l.valorNovo,
            autorId: user?.id ?? null,
          })),
        );
      }

      await recalcularSinalizadorDaAdmissao(tx as never, id);
    });

    return { admissaoId: id, uniforme: dto.uniforme };
  }

  /**
   * PRÉVIA DA IMPORTAÇÃO DE MATRÍCULAS (melhoria EAC, item 11d): lê a planilha e diz o que vai
   * acontecer, SEM gravar nada.
   *
   * DUAS ETAPAS, e a primeira não escreve: importação que grava direto é importação que ninguém
   * confere, e o estrago aparece depois. Aqui o time vê linha a linha quem casou, qual matrícula
   * está lá hoje e quem ficou de fora, e só então confirma.
   *
   * CASA POR CPF, e só entre as admissões VIVAS. O CPF pode ter N admissões (§A.3 regra 6): hoje
   * nenhum tem duas VIVAS ao mesmo tempo, mas quando tiver, a linha não é adivinhada, vai para a
   * lista de não casadas com o motivo. Chutar qual das duas recebe a matrícula seria o pior desfecho
   * possível numa importação em massa.
   *
   * §A.6: a prévia devolve nome (é o que permite conferir que a matrícula é da pessoa certa) e o CPF
   * que veio na planilha, sem log.
   */
  async previaMatriculas(arquivo: Buffer) {
    // XLSX ou CSV, decidido pelos MAGIC BYTES e não pela extensão (§A.27: extensão é o que o
    // navegador disse, magic byte é o que o arquivo é). A regra sobre as células é a mesma nos dois.
    const linhas = (
      ehXlsx(arquivo)
        ? await lerXlsxMatriculas(arquivo)
        : lerPlanilhaMatriculas(arquivo.toString("utf8"))
    ).filter((l) => !ehCabecalho(l));

    const casaram: {
      admissaoId: string;
      cpf: string;
      candidato: string;
      matriculaAtual: string | null;
      matricula: string;
    }[] = [];
    const naoCasaram: { linha: number; cpf: string | null; matricula: string | null; motivo: string }[] =
      [];

    const cpfs = [...new Set(linhas.map((l) => l.cpf).filter((c): c is string => Boolean(c)))];
    const vivas = cpfs.length
      ? await this.db
          .select({
            id: admissoes.id,
            cpf: admissoes.candidatoCpf,
            matricula: admissoes.matricula,
            nome: candidatos.nome,
          })
          .from(admissoes)
          .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
          .where(
            and(
              inArray(admissoes.candidatoCpf, cpfs),
              inArray(admissoes.farolGlobal, ["EM_ADMISSAO", "BANCO_AGUARDAR"]),
            ),
          )
      : [];

    const porCpf = new Map<string, typeof vivas>();
    for (const v of vivas) porCpf.set(v.cpf, [...(porCpf.get(v.cpf) ?? []), v]);

    for (const l of linhas) {
      if (!l.cpf) {
        naoCasaram.push({ ...l, motivo: "Linha sem CPF válido (11 dígitos)." });
        continue;
      }
      if (!l.matricula) {
        naoCasaram.push({ ...l, motivo: "Linha sem matrícula." });
        continue;
      }
      const achadas = porCpf.get(l.cpf) ?? [];
      if (achadas.length === 0) {
        naoCasaram.push({ ...l, motivo: "CPF sem admissão ativa no sistema." });
        continue;
      }
      if (achadas.length > 1) {
        naoCasaram.push({
          ...l,
          motivo: "CPF com mais de uma admissão ativa. Lance a matrícula pela ficha.",
        });
        continue;
      }
      const a = achadas[0];
      casaram.push({
        admissaoId: a.id,
        cpf: l.cpf,
        candidato: a.nome,
        matriculaAtual: a.matricula,
        matricula: l.matricula,
      });
    }

    return { casaram, naoCasaram, total: linhas.length };
  }

  /**
   * APLICA as matrículas confirmadas na prévia, numa transação só.
   *
   * REUSA A ESCRITA E A TRILHA do Gerenciador: mesma coluna, mesmo `candidato_alteracoes_log`, campo
   * a campo, com o autor. Quem olhar a trilha de uma admissão não distingue "veio da planilha" de
   * "alguém digitou", e é assim que tem de ser: o que importa é quem mudou o quê e quando.
   *
   * SÓ GRAVA O QUE MUDOU: matrícula igual à que já está lá não vira linha de trilha nem update.
   *
   * TUDO OU NADA: a transação é única. As linhas que não casaram já foram separadas na prévia e nem
   * chegam aqui, então o lote que roda é o lote que o time conferiu.
   */
  async aplicarMatriculas(
    itens: { admissaoId: string; matricula: string }[],
    user?: AuthUser,
  ) {
    if (!itens.length) throw new BadRequestException("Nenhuma matrícula para aplicar.");

    return this.db.transaction(async (tx) => {
      const atuais = await tx
        .select({ id: admissoes.id, matricula: admissoes.matricula })
        .from(admissoes)
        .where(
          inArray(
            admissoes.id,
            itens.map((i) => i.admissaoId),
          ),
        );
      const porId = new Map(atuais.map((a) => [a.id, a.matricula]));

      let gravadas = 0;
      let semMudanca = 0;
      const logs: {
        admissaoId: string;
        campo: string;
        valorAnterior: string | null;
        valorNovo: string | null;
        autorId: string | null;
      }[] = [];

      for (const item of itens) {
        if (!porId.has(item.admissaoId)) continue;
        const anterior = porId.get(item.admissaoId) ?? null;
        const nova = item.matricula.trim() || null;
        if (anterior === nova) {
          semMudanca++;
          continue;
        }
        await tx
          .update(admissoes)
          .set({ matricula: nova, atualizadoEm: new Date() })
          .where(eq(admissoes.id, item.admissaoId));
        logs.push({
          admissaoId: item.admissaoId,
          campo: "matricula",
          valorAnterior: anterior,
          valorNovo: nova,
          autorId: user?.id ?? null,
        });
        gravadas++;
      }

      if (logs.length) await tx.insert(candidatoAlteracoesLog).values(logs);
      return { gravadas, semMudanca, ignoradas: itens.length - gravadas - semMudanca };
    });
  }

  async trocarCliente(
    id: string,
    dto: { codCliente: string; cargoId: string },
    user: AuthUser,
  ) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    const frentes = await this.db
      .select({ tipo: frentesAdmissao.tipo, concluida: frentesAdmissao.concluida })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, id));
    const TODAS = ["AUDITORIA", "EXAME", "CADASTRO_CONTRATO"] as const;
    const concluidas = new Set(frentes.filter((f) => f.concluida).map((f) => String(f.tipo)));
    if (TODAS.every((t) => concluidas.has(t))) {
      throw new ConflictException(
        "Esta admissão já concluiu as três frentes. A troca de cliente só vale antes da conclusão.",
      );
    }

    const [cliente] = await this.db
      .select({ codCliente: clientes.codCliente, razaoSocial: clientes.razaoSocial })
      .from(clientes)
      .where(eq(clientes.codCliente, dto.codCliente));
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");
    const [cargo] = await this.db
      .select({ id: cargos.id, nome: cargos.nome })
      .from(cargos)
      .where(eq(cargos.id, dto.cargoId));
    if (!cargo) throw new NotFoundException("Cargo não encontrado.");

    if (adm.codCliente === cliente.codCliente && adm.cargoId === cargo.id) {
      throw new ConflictException("O cliente e o cargo informados já são os da admissão.");
    }

    // TRAVA DA RÉGUA (decisão do diretor, ajuste final do item 8). A régua documental resolve por
    // (cliente + cargo): trocar para um par que nunca foi cadastrado deixaria a admissão com o
    // CHECKLIST VAZIO, sem nenhum documento exigido, e o problema só apareceria depois, quando alguém
    // percebesse que a auditoria não cobra nada. Aconteceu na prova em produção da entrega anterior.
    //
    // A mensagem diz QUAL par ficou sem régua, com nome e não só código: o Master precisa saber
    // exatamente o que cadastrar antes de tentar de novo.
    const [temRegua] = await this.db
      .select({ n: count() })
      .from(reguaDocumental)
      .where(
        and(
          eq(reguaDocumental.codCliente, cliente.codCliente),
          eq(reguaDocumental.cargoId, cargo.id),
        ),
      );
    if (!temRegua || temRegua.n === 0) {
      throw new ConflictException(
        `O par ${cliente.codCliente} - ${cliente.razaoSocial} + ${cargo.nome} não tem régua ` +
          `documental cadastrada. Cadastre a régua desse cliente e cargo antes de trocar, senão a ` +
          `admissão ficaria sem nenhum documento exigido.`,
      );
    }

    // Rótulos do estado ANTERIOR para a trilha ficar legível (o código sozinho não diz nada a quem lê).
    const anterior = await this.rotulosClienteCargo(adm.codCliente, adm.cargoId);
    const agora = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({
          codCliente: cliente.codCliente,
          cargoId: cargo.id,
          // GRUPO REESCRITO (cenário 2, etapa 3): este é o ÚNICO caminho que reescreve o carimbo, e
          // reescrever é o certo aqui. Trocar o cliente é dizer que a admissão nunca foi daquele
          // cliente, então o grupo antigo era do cliente errado. Fica null quando o cliente novo não
          // é membro de grupo nenhum, pelo mesmo motivo da loja logo abaixo.
          grupoClienteId: await carimboDoGrupo(this.db, cliente.codCliente),
          // LOJA LIMPA NA TROCA DE CLIENTE (etapa 3, decisão do diretor). A loja pertence ao cliente
          // ANTIGO: mantê-la deixaria uma admissão do DIA apontando para uma loja do CRM, que é
          // exatamente a contaminação que `validarLojaDoCliente` impede em todos os outros caminhos.
          // Zerar aqui é o que mantém a invariante verdadeira depois da troca, e a loja nova é
          // escolhida pelo olhinho ou pelo editar, que é onde a pessoa sabe qual é.
          lojaId: null,
          // Ponteiro do cliente ANTIGO: some na troca. Hoje é nulo em toda a base, mas deixá-lo
          // apontando para o vínculo antigo seria uma bomba armada para quando ele passar a ser usado.
          clienteVinculoId: null,
          trocaClienteEm: agora,
          trocaClientePor: user.id,
          atualizadoEm: agora,
        })
        .where(eq(admissoes.id, id));

      // HISTÓRICO: dois eventos, um por campo, no MESMO formato que o modal do olho já lê.
      await tx.insert(candidatoAlteracoesLog).values([
        {
          admissaoId: id,
          campo: "trocaCliente",
          valorAnterior: anterior.cliente,
          valorNovo: `${cliente.codCliente} - ${cliente.razaoSocial}`,
          autorId: user.id,
        },
        {
          admissaoId: id,
          campo: "trocaCargo",
          valorAnterior: anterior.cargo,
          valorNovo: cargo.nome,
          autorId: user.id,
        },
      ]);
    });

    // O enum GRAVADO precisa concordar com a régua do cliente NOVO: a obrigatoriedade pode ser outra,
    // e o KPI do Gerenciador ainda lê o enum. A contagem viva das telas já mudou sozinha.
    await this.recalcularSinalizadorDaAdmissao(id);

    return {
      ok: true,
      cliente: { codCliente: cliente.codCliente, razaoSocial: cliente.razaoSocial },
      cargo: { id: cargo.id, nome: cargo.nome },
      anterior,
      trocaClienteEm: agora.toISOString(),
    };
  }

  /**
   * O consultor confere os documentos e o prontuário e dá a troca por revisada: o carimbo é limpo e o
   * aviso vermelho some. O que aconteceu NÃO some: fica no histórico, com quem revisou e quando.
   */
  async marcarTrocaRevisada(id: string, user: AuthUser) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (!adm.trocaClienteEm) {
      return { ok: true, jaRevisada: true };
    }
    const agora = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({ trocaClienteEm: null, trocaClientePor: null, atualizadoEm: agora })
        .where(eq(admissoes.id, id));
      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId: id,
        campo: "trocaClienteRevisada",
        valorAnterior: "pendente de revisão",
        valorNovo: "revisada",
        autorId: user.id,
      });
    });
    return { ok: true, revisadaEm: agora.toISOString() };
  }

  /**
   * CORRIGE O CPF de uma admissão (item 9, Frente B). Só MASTER/SUPER_ADMIN (gate no controller).
   *
   * É SÓ ACERTAR O CAMPO para bater com o documento (decisão do diretor): não reprocessa auditoria,
   * não renomeia arquivo do Drive, não reagrupa nada, e por isso NÃO acende aviso vermelho nem exige
   * revisão como a troca de cliente. Aquilo é troca estrutural (muda régua e pasta); isto é correção
   * de digitação.
   *
   * SEM TRAVA DE FASE, por decisão do diretor: a IA costuma pegar o CPF errado na auditoria, mas o
   * erro pode aparecer depois, e uma admissão adiantada com CPF errado é exatamente a que mais precisa
   * ser corrigida.
   *
   * COMO A TROCA ACONTECE: `admissoes.candidato_cpf` é FK de `candidatos.cpf` (PK), então corrigir NÃO
   * é editar o CPF do candidato, é REAPONTAR a admissão para a linha certa. Editar a PK arrastaria
   * junto as OUTRAS admissões da mesma pessoa (regra 6: um candidato tem N admissões), que estão
   * certas. A linha nova nasce com os dados da antiga; a antiga, se ficar sem nenhuma admissão, é um
   * fantasma de digitação e sai (§A.6, minimização).
   *
   * COLISÃO: se o CPF corrigido já pertence a alguém, o Master vê O NOME de quem é e decide (AVISA,
   * não bloqueia). O reenvio com `confirmarDuplicado` é a decisão dele: a admissão passa a apontar
   * para o candidato existente, e o nome dele NÃO é sobrescrito.
   */
  async corrigirCpf(
    id: string,
    dto: { cpf: string; confirmarDuplicado?: boolean },
    user: AuthUser,
  ) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    const novo = normalizeCpf(dto.cpf);
    // Não troca um errado por outro inválido: o CPF novo passa pelo MESMO dígito verificador da
    // Frente A. §A.6: nem a mensagem nem o log repetem o CPF.
    if (!isValidCpf(novo)) {
      throw new BadRequestException(
        "CPF inválido: o dígito verificador não fecha. Confira o CPF no documento e informe os 11 dígitos.",
      );
    }
    if (novo === adm.candidatoCpf) {
      throw new ConflictException("O CPF informado já é o desta admissão.");
    }

    const anterior = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });
    const jaExiste = await this.db.query.candidatos.findFirst({ where: eq(candidatos.cpf, novo) });

    // Nomes das admissões que já usam o CPF novo: é o que o Master precisa ver para decidir. Nome, e
    // não código: "o CPF é de FULANO DE TAL" é a informação que resolve, o id não diz nada.
    const outras = jaExiste
      ? await this.db
          .select({ admissaoId: admissoes.id, farol: admissoes.farolGlobal })
          .from(admissoes)
          .where(eq(admissoes.candidatoCpf, novo))
      : [];

    if (jaExiste && !dto.confirmarDuplicado) {
      throw new ConflictException({
        // O front lê o CÓDIGO (não a frase) para abrir a confirmação com o nome do duplicado.
        codigo: "CPF_DUPLICADO",
        message:
          `Este CPF já está cadastrado para ${jaExiste.nome}` +
          (outras.length > 0
            ? `, com ${outras.length} admiss${outras.length === 1 ? "ão" : "ões"}.`
            : ".") +
          " Confirme que é a mesma pessoa para aplicar a correção mesmo assim.",
        nomeDuplicado: jaExiste.nome,
        admissoesDoDuplicado: outras.length,
      });
    }

    // O índice parcial `uq_admissao_cpf_vaga_viva` impede DUAS admissões vivas do mesmo
    // (candidato_cpf + id_vacancy). Checar antes vira mensagem legível em vez de erro cru do banco.
    if (adm.idVacancy && ehFarolVivo(adm.farolGlobal as FarolGlobal)) {
      const [conflito] = await this.db
        .select({ id: admissoes.id })
        .from(admissoes)
        .where(
          and(
            eq(admissoes.candidatoCpf, novo),
            eq(admissoes.idVacancy, adm.idVacancy),
            ne(admissoes.id, id),
            inArray(admissoes.farolGlobal, [
              "EM_ADMISSAO",
              "BANCO_AGUARDAR",
              "AGUARDANDO_LIBERACAO",
            ]),
          ),
        );
      if (conflito) {
        throw new ConflictException(
          "Já existe uma admissão viva desse CPF para a MESMA vaga do Pandapé. Trate a duplicata antes de corrigir o CPF.",
        );
      }
    }

    const agora = new Date();
    await this.db.transaction(async (tx) => {
      if (!jaExiste) {
        // Linha nova com os dados que já existiam: só o CPF estava errado, o resto da ficha não.
        await tx
          .insert(candidatos)
          .values({
            cpf: novo,
            nome: anterior?.nome ?? "não informado",
            email: anterior?.email ?? null,
            telefone: anterior?.telefone ?? null,
            dataNascimento: anterior?.dataNascimento ?? null,
            sexo: anterior?.sexo ?? null,
            banco: anterior?.banco ?? null,
          })
          .onConflictDoNothing({ target: candidatos.cpf });
      }

      await tx
        .update(admissoes)
        .set({ candidatoCpf: novo, atualizadoEm: agora })
        .where(eq(admissoes.id, id));

      // HISTÓRICO do modal do olho, mesmo formato do item 8: de/para, quem e quando.
      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId: id,
        campo: "correcaoCpf",
        valorAnterior: adm.candidatoCpf,
        valorNovo: novo,
        autorId: user.id,
      });

      // Fantasma de digitação: o CPF errado sem NENHUMA admissão apontando para ele não é histórico
      // de ninguém, é PII sem uso (§A.6). Com admissão restante, fica: pertence a outra pessoa.
      const [restantes] = await tx
        .select({ n: count() })
        .from(admissoes)
        .where(eq(admissoes.candidatoCpf, adm.candidatoCpf));
      if (!restantes || restantes.n === 0) {
        await tx.delete(candidatos).where(eq(candidatos.cpf, adm.candidatoCpf));
      }
    });

    return {
      ok: true,
      cpfAnterior: adm.candidatoCpf,
      cpfNovo: novo,
      // Só volta preenchido quando o Master confirmou uma colisão: a tela mostra de quem era o CPF.
      duplicadoConfirmado: jaExiste ? { nome: jaExiste.nome } : null,
      corrigidoEm: agora.toISOString(),
    };
  }

  /** Rótulos legíveis do par atual, para a trilha não guardar só códigos. */
  private async rotulosClienteCargo(codCliente: string | null, cargoId: string | null) {
    const [cli] = codCliente
      ? await this.db
          .select({ razaoSocial: clientes.razaoSocial })
          .from(clientes)
          .where(eq(clientes.codCliente, codCliente))
      : [];
    const [car] = cargoId
      ? await this.db.select({ nome: cargos.nome }).from(cargos).where(eq(cargos.id, cargoId))
      : [];
    return {
      cliente: codCliente ? `${codCliente}${cli ? ` - ${cli.razaoSocial}` : ""}` : "não informado",
      cargo: car?.nome ?? "não informado",
    };
  }

  /**
   * Regrava `sinalizador_preenchimento` a partir da régua do cliente ATUAL da admissão. Usado depois
   * da troca de cliente, quando a obrigatoriedade pode ter mudado.
   */
  private async recalcularSinalizadorDaAdmissao(id: string): Promise<void> {
    // MUDOU DE CASA (§A.17 etapa 4): o corpo vive em `regua/sinalizador.repo`, porque a tela de
    // Benefícios passou a precisar do MESMO recálculo ao editar o pacote. O comportamento é o de
    // sempre; copiar a régua para lá seria a divergência garantida na primeira mudança de regra.
    await recalcularSinalizadorDaAdmissao(this.db, id);
  }


  async editar(id: string, dto: UpdateAdmissaoDto, user?: AuthUser) {
    // OST ajustes, item 1: a edição pelo Gerenciador NÃO trava por valor de benefício em falta. O
    // salvar grava o que já está preenchido; o valor que falta segue como pendência (visível no
    // modal), sem bloquear. Vale inclusive quando o farol é de declínio. (A criação pelo wizard
    // mantém a exigência — fora do escopo desta OST.)
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    // LOJA (etapa 3): validada contra o cliente ATUAL da admissão, antes de a transação abrir. O
    // editar não troca cliente (isso é a rota `trocar-cliente`, que limpa a loja), então o
    // cliente aqui é sempre o de `adm`.
    await validarLojaDoCliente(this.db, adm.codCliente, dto.lojaId);
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, id),
    });

    // Campo "" no payload → limpa (null); ausente → mantém.
    const orNull = (v?: string) =>
      v === undefined ? undefined : v.trim() === "" ? null : v.trim();
    // Valor efetivo de campo texto: ausente (undefined) → mantém o anterior; "" → null; senão trim.
    const efetivo = (v: string | undefined, anterior: string | null) =>
      v === undefined ? anterior : v.trim() === "" ? null : v.trim();

    const result = await this.db.transaction(async (tx) => {
      // Trilha de alteração de candidato (OST-EA-GESTAO-USUARIOS). Compara estado anterior vs novo
      // campo a campo; só campos que MUDARAM viram log (nunca CPF/cod_cliente — imutáveis, §A.3).
      const logs: { campo: string; valorAnterior: string | null; valorNovo: string | null }[] = [];
      const str = (v: unknown): string | null =>
        v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
      const registrar = (campo: string, anterior: unknown, novo: unknown) => {
        const a = str(anterior);
        const n = str(novo);
        if (a !== n) logs.push({ campo, valorAnterior: a, valorNovo: n });
      };

      // Vaga/folha (1:1).
      if (dto.vagaFolha) {
        const vf = dto.vagaFolha;
        const novoSalarioVf =
          vf.salario === undefined ? (vaga?.salario ?? null) : vf.salario || null;
        registrar("salario", vaga?.salario ?? null, novoSalarioVf);
        registrar(
          "beneficios",
          vaga?.beneficios ?? null,
          efetivo(vf.beneficios, vaga?.beneficios ?? null),
        );
        registrar("escala", vaga?.escala ?? null, efetivo(vf.escala, vaga?.escala ?? null));
        registrar(
          "centroCusto",
          vaga?.centroCusto ?? null,
          efetivo(vf.centroCusto, vaga?.centroCusto ?? null),
        );
        registrar("setor", vaga?.setor ?? null, efetivo(vf.setor, vaga?.setor ?? null));
        registrar(
          "departamento",
          vaga?.departamento ?? null,
          efetivo(vf.departamento, vaga?.departamento ?? null),
        );
        registrar("gestorBp", vaga?.gestorBp ?? null, efetivo(vf.gestorBp, vaga?.gestorBp ?? null));
        registrar("motivo", vaga?.motivo ?? null, efetivo(vf.motivo, vaga?.motivo ?? null));
        registrar(
          "tempoContrato",
          vaga?.tempoContrato ?? null,
          efetivo(vf.tempoContrato, vaga?.tempoContrato ?? null),
        );
        registrar("endereco", vaga?.endereco ?? null, efetivo(vf.endereco, vaga?.endereco ?? null));

        await tx
          .update(dadosVagaFolha)
          .set({
            salario: vf.salario === undefined ? undefined : vf.salario || null,
            beneficios: orNull(vf.beneficios),
            escala: orNull(vf.escala),
            centroCusto: orNull(vf.centroCusto),
            setor: orNull(vf.setor),
            departamento: orNull(vf.departamento),
            gestorBp: orNull(vf.gestorBp),
            motivo: orNull(vf.motivo),
            tempoContrato: orNull(vf.tempoContrato),
            endereco: orNull(vf.endereco),
          })
          .where(eq(dadosVagaFolha.admissaoId, id));
      }

      // Pacote ESTRUTURADO: ausente = não mexe; presente = SUBSTITUI o pacote inteiro. A troca é
      // delete+insert dentro da transação (o front manda a lista final que ficou na tela).
      if (dto.pacoteBeneficios) {
        // Estado ANTES, lido só aqui: edição que não mexe em benefício não paga esta consulta.
        // Rótulo legível ("VR (Vale-Refeição): 500,00, ...") em vez de uma lista de uuids, porque
        // o histórico do olho é lido por gente.
        const pacoteAntes = await this.rotularPacote(tx, id);
        await tx.delete(admissaoBeneficio).where(eq(admissaoBeneficio.admissaoId, id));
        if (dto.pacoteBeneficios.length > 0) {
          await tx.insert(admissaoBeneficio).values(
            dto.pacoteBeneficios.map((b) => ({
              admissaoId: id,
              beneficioId: b.beneficioId,
              valor: b.valor === undefined ? null : b.valor.toFixed(2),
            })),
          );
        }
        const pacoteDepois = await this.rotularPacote(tx, id);
        // Mesmo campo "beneficios" da trilha antiga: para quem lê o histórico, é a mesma informação,
        // independente de estar em string legada ou estruturada.
        registrar("beneficios", pacoteAntes || null, pacoteDepois || null);
      }

      // Dados pessoais do candidato (OST-EA-GESTAO-USUARIOS — ajuste de escopo): nome/e-mail/telefone/
      // nascimento agora editáveis (antes imutáveis). CPF permanece imutável (identidade, §A.3). O
      // candidato é compartilhado por CPF → a alteração vale para todas as admissões dessa pessoa; o
      // log fica sob ESTA admissão. Cada campo que muda vira uma linha em candidato_alteracoes_log.
      let novoNomeCandidato = candidato?.nome ?? "";
      if (dto.candidato && candidato) {
        const c = dto.candidato;
        // nome é obrigatório (notNull): vazio/ausente mantém o anterior.
        const novoNome =
          c.nome !== undefined && c.nome.trim() !== "" ? c.nome.trim() : candidato.nome;
        const novoEmail = efetivo(c.email, candidato.email ?? null);
        const novoTelefone = efetivo(c.telefone, candidato.telefone ?? null);
        const novoNasc =
          c.dataNascimento === undefined
            ? (candidato.dataNascimento ?? null)
            : c.dataNascimento.trim() === ""
              ? null
              : c.dataNascimento.trim();

        // SEXO (OST do seletor de sexo, segunda entrega): correção para admissão JÁ liberada, que
        // é onde não havia caminho nenhum. Ausente no dto mantém o que está; nunca vira null por
        // omissão, para um salvamento de outro campo não apagar o sexo de ninguém.
        const novoSexo = c.sexo === undefined ? (candidato.sexo ?? null) : c.sexo;

        registrar("nome", candidato.nome, novoNome);
        registrar("email", candidato.email ?? null, novoEmail);
        registrar("telefone", candidato.telefone ?? null, novoTelefone);
        registrar("dataNascimento", candidato.dataNascimento ?? null, novoNasc);
        registrar("sexo", candidato.sexo ?? null, novoSexo);

        novoNomeCandidato = novoNome;

        await tx
          .update(candidatos)
          .set({
            nome: novoNome,
            email: novoEmail,
            telefone: novoTelefone,
            dataNascimento: novoNasc,
            sexo: novoSexo,
            atualizadoEm: new Date(),
          })
          .where(eq(candidatos.cpf, adm.candidatoCpf));
      }

      const novoTipoContrato =
        dto.tipoContrato === undefined ? adm.tipoContrato : orNull(dto.tipoContrato);
      const novaDataAdmissao =
        dto.dataAdmissao === undefined ? adm.dataAdmissao : orNull(dto.dataAdmissao);
      const novaMatricula = dto.matricula === undefined ? adm.matricula : orNull(dto.matricula);
      // farolGlobal: só loga se veio no dto (ação direta do usuário). O recompute automático pós-
      // transação (recomputeFarolGlobal) é do sistema e NÃO gera log de usuário (OST).
      const novoFarol = (dto.farolGlobal as FarolGlobal) ?? adm.farolGlobal;
      /**
       * O SELETOR DE STATUS E A MARCA DE BANCO ANDAM JUNTOS (correção do bug de 13/08/2026).
       *
       * Escolher "Banco, Aguardar" no seletor é dizer "esta admissão é de banco", então a marca
       * acompanha; escolher "Em Admissão" é dizer o contrário, e a marca sai. Sem isso, os dois
       * campos brigavam: o usuário escolhia o farol, o recompute olhava a marca (que continuava
       * desmarcada) e devolvia EM_ADMISSAO no instante seguinte, que é exatamente o bug relatado.
       *
       * Os demais faróis (declínio, rescisão, concluída) NÃO tocam a marca: são desfechos, e o fato
       * de a admissão ter sido de banco é histórico dela, não algo que o desfecho apague.
       */
      const isBancoPeloFarol =
        dto.farolGlobal === "BANCO_AGUARDAR"
          ? true
          : dto.farolGlobal === "EM_ADMISSAO"
            ? false
            : undefined;
      const novoIsBanco =
        dto.isBanco !== undefined
          ? dto.isBanco
          : isBancoPeloFarol !== undefined
            ? isBancoPeloFarol
            : adm.isBanco;
      // REATIVAÇÃO = reverso COMPLETO do declínio (OST): a admissão estava em DECLINOU/RESCISAO e
      // volta a um farol ativo. Não basta trocar o farol: o motivo é limpo e as frentes voltam ao
      // estado inicial de admissão viva (Auditoria "Análise Pendente", Exame "A Agendar"), senão a
      // admissão reaparece na fila ainda marcada como declinada. Espelha a `declinarAdmissao`.
      const eraDeclinio = adm.farolGlobal === "DECLINOU" || adm.farolGlobal === "RESCISAO";
      const novoEhDeclinio = novoFarol === "DECLINOU" || novoFarol === "RESCISAO";
      const reativando = eraDeclinio && !novoEhDeclinio;
      // Motivo do declínio: ao reativar, LIMPA sempre. Fora disso: ausente = mantém; null/"" = limpa;
      // uuid = vincula (§A.14, item 3). Grava no MESMO admissoes.motivo_declinio_id do olho.
      const novoMotivoDeclinio = reativando
        ? null
        : dto.motivoDeclinioId === undefined
          ? adm.motivoDeclinioId
          : dto.motivoDeclinioId || null;

      registrar("tipoContrato", adm.tipoContrato, novoTipoContrato);
      registrar("dataAdmissao", adm.dataAdmissao, novaDataAdmissao);
      registrar("matricula", adm.matricula, novaMatricula);
      if (dto.farolGlobal !== undefined) registrar("farolGlobal", adm.farolGlobal, novoFarol);
      registrar("isBanco", adm.isBanco, novoIsBanco);
      // TRILHA DO DECLÍNIO: o motivo é sobrescrito na linha da admissão (e a reativação o LIMPA),
      // então sem log o "por que" do declínio anterior some no próximo ciclo. Registrado pelo NOME
      // (o histórico é lido por gente) e só quando muda: edição que não mexe no motivo não paga as
      // consultas. Declínio = motivo entra; reativação = motivo vai a null. A data é o `criadoEm`.
      if (novoMotivoDeclinio !== adm.motivoDeclinioId) {
        registrar(
          "motivoDeclinio",
          await this.nomeMotivoDeclinio(tx, adm.motivoDeclinioId),
          await this.nomeMotivoDeclinio(tx, novoMotivoDeclinio),
        );
      }

      const novoSalario =
        dto.vagaFolha?.salario === undefined
          ? (vaga?.salario ?? null)
          : dto.vagaFolha.salario || null;

      // Recalcula o sinalizador (F5) com os valores efetivos, pela régua UNIFICADA.
      //
      // RECORTE (decisão do diretor): só admissão VIVA é recalculada. Uma admissão CONCLUÍDA ou de
      // DECLÍNIO editada aqui MANTÉM o sinalizador que tem: a régua nova não reescreve o histórico
      // da carga, então os cards da base histórica não se mexem. `novoFarol` é o farol efetivo
      // depois desta edição, não o anterior: mudar o farol para concluída congela o sinalizador
      // no mesmo passo.
      const efetivoVf = {
        salario: novoSalario ?? undefined,
        beneficios: dto.vagaFolha?.beneficios ?? vaga?.beneficios ?? undefined,
        escala: dto.vagaFolha?.escala ?? vaga?.escala ?? undefined,
        centroCusto: dto.vagaFolha?.centroCusto ?? vaga?.centroCusto ?? undefined,
        setor: dto.vagaFolha?.setor ?? vaga?.setor ?? undefined,
        gestorBp: dto.vagaFolha?.gestorBp ?? vaga?.gestorBp ?? undefined,
      };
      // Pacote estruturado DEPOIS da edição: o que veio no dto, ou o que já estava gravado.
      const temEstruturado = dto.pacoteBeneficios
        ? dto.pacoteBeneficios.length > 0
        : (
            await tx
              .select({ id: admissaoBeneficio.id })
              .from(admissaoBeneficio)
              .where(eq(admissaoBeneficio.admissaoId, id))
              .limit(1)
          ).length > 0;
      const sinalizador = ehFarolVivo(novoFarol)
        ? calcSinalizadorPreenchimento({
            candidato: { nome: novoNomeCandidato, cpf: adm.candidatoCpf },
            codCliente: adm.codCliente,
            cargoId: adm.cargoId,
            dataAdmissao: novaDataAdmissao ?? undefined,
            tipoContrato: novoTipoContrato ?? undefined,
            vagaFolha: efetivoVf,
            // A edição do lápis não mexe em uniforme (é campo da liberação), mas PRECISA levar a
            // resposta já gravada: sem ela, salvar qualquer outro campo faria a admissão voltar a
            // PARCIAL por uma pendência de uniforme que já tinha sido respondida.
            possuiUniforme: vaga?.possuiUniforme,
            isBanco: novoIsBanco,
            termoBancoEntregue: novoIsBanco ? await this.termoBancoEntregue(id) : false,
            temBeneficioEstruturado: temEstruturado,
          })
        : adm.sinalizadorPreenchimento;

      const [upd] = await tx
        .update(admissoes)
        .set({
          tipoContrato: novoTipoContrato,
          dataAdmissao: novaDataAdmissao,
          // LOJA (etapa 3): é por aqui que o EDITAR e o OLHINHO corrigem admissão sem loja ou com a
          // loja errada. `undefined` mantém (salvar outro campo não pode apagar a loja de ninguém,
          // mesma régua do sexo); `null` explícito limpa. Validada antes da transação.
          lojaId: dto.lojaId === undefined ? undefined : dto.lojaId,
          matricula: novaMatricula,
          farolGlobal: novoFarol,
          motivoDeclinioId: novoMotivoDeclinio,
          isBanco: novoIsBanco,
          sinalizadorPreenchimento: sinalizador,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, id))
        .returning({ id: admissoes.id, sinalizador: admissoes.sinalizadorPreenchimento });

      // Reativação (OST declínio não-destrutivo): NÃO toca em nenhuma frente. O declínio nunca
      // sobrescreveu o dado real das frentes, então não há o que "restaurar": o exame/prontuário/ASO/
      // datas seguem intactos. Reativar = só desligar o farol (novoFarol) + limpar o motivo
      // (novoMotivoDeclinio, acima) + recalcular o sinalizador pelo estado REAL (feito acima).

      if (logs.length > 0) {
        await tx.insert(candidatoAlteracoesLog).values(
          logs.map((l) => ({
            admissaoId: id,
            campo: l.campo,
            valorAnterior: l.valorAnterior,
            valorNovo: l.valorNovo,
            autorId: user?.id ?? null,
          })),
        );
      }

      return { admissaoId: upd.id, sinalizador: upd.sinalizador };
    });

    // Editar a data de admissão pode alternar EM_ADMISSAO ↔ BANCO_AGUARDAR (§A.3 / Fase 4
    // complemento). A escolha manual de farol (DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA) é preservada.
    const farolGlobal = await recomputeFarolGlobal(this.db, id);
    return { ...result, farolGlobal };
  }

  /**
   * F10 — deleta uma admissão (Gerenciador). DECISÃO TÉCNICA: **hard delete** — as FKs em cascata
   * (vaga/folha, documentos, frentes, eventos, NCs, integração Pandapé) removem os filhos. Restrito
   * a MASTER/SUPER_ADMIN no controller (ação destrutiva). Soft delete fica como evolução futura.
   */
  async deletar(id: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    await this.db.delete(admissoes).where(eq(admissoes.id, id));
    return { deleted: true, id };
  }
}
