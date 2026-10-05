import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  AS_VAGA_CAMPOS_DA_ADMISSAO,
  AS_VAGA_CAMPOS_NUNCA_EDITAVEIS,
  type AsVagaEdicaoNegada,
  type AsVagaEdicaoPrevia,
  type AsVagaEdicaoResultado,
  type AsVagaExclusaoPrevia,
  type CandidaturaSituacao,
  contraparteDe,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidaturaEntrevistas,
  asCandidaturas,
  asShortlists,
  asVagaStatusEventos,
  usuarios,
  vagaBeneficio,
  vagaClienteCorrecoes,
  vagaConsultorTransferencias,
  vagaEdicoes,
  vagaExclusoes,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import {
  consomePosicao,
  ladoDaCandidatura,
  ocupacaoDaVaga,
} from "../../domain/candidatura";
import { excessoDePosicoes, normalizarCodigoVaga } from "../../domain/vaga";
import {
  VAGA_EDICAO_CAMPOS_DA_TRILHA,
  camposDaAdmissaoAlterados,
  campoMudou,
  decidirPosicoesDaEdicao,
  trilhaDoCampo,
} from "../../domain/vaga-edicao";
import { papelDeVagaEmProcesso } from "../../domain/vaga-status-derivado";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { VagaStatusService, type ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import type { CreateVagaDto, EditarVagaDto } from "./vagas.dto";
import { VagasService } from "./vagas.service";

/**
 * ─ EDITAR E EXCLUIR A VAGA JÁ LIBERADA (Central de Vagas, 05/10/2026) ────────────────────────────
 *
 * Mapa, veto do `seguranca` e as 7 decisões do diretor: `docs/MAPA-CRUD-VAGA-LIBERADA.md`.
 *
 * ARQUIVO PRÓPRIO, e não mais um método no `VagasService`, por exigência do veto: a edição NÃO
 * reaproveita o `atualizar` (ele grava nulo em todo campo ausente e reescreve os benefícios) e NÃO
 * relaxa a guarda dele. Ela reaproveita as PEÇAS que o `atualizar` usa (`camposDaTrilha`, a régua dos
 * obrigatórios, os resolvedores de catálogo, a régua do excesso e do rastro da meta), que é o que
 * mantém os acoplamentos (vínculo não temporário apaga o substituído, a UF sai da cidade) iguais
 * nas duas portas.
 *
 * ┌─ AS REGRAS, NA ORDEM EM QUE A TRANSAÇÃO AS APLICA ─────────────────────────────────────────────┐
 * │ 1. A linha da vaga é TRAVADA (`for update`) e o papel é conferido DEPOIS da trava: o fechamento│
 * │    automático da varredura pode encerrar a vaga a qualquer instante. Só ABERTURA e ENTREGA.    │
 * │ 2. Campo que nunca se edita (`AS_VAGA_CAMPOS_NUNCA_EDITAVEIS`) só passa IGUAL ao atual.        │
 * │ 3. Resultado = vaga atual + corpo (lista branca), pelo próprio `camposDaTrilha`, com o status  │
 * │    ATUAL; régua dos obrigatórios e CPF do substituído conferido como vaga publicada.           │
 * │ 4. Nada mudou: sucesso, nada gravado.                                                          │
 * │ 5. Fronteira A&S/ADM (decisão 3): com gente enviada à admissão, os campos que a ponte copia    │
 * │    não mudam, conferidos no RESULTADO.                                                         │
 * │ 6. Cliente (decisão 2): existe, nunca vazio, e a troca apaga as entrevistas com o cliente      │
 * │    antigo, com confirmação.                                                                    │
 * │ 7. Posições (decisões 5 e 6): a régua de `editarPosicoes` repetida DENTRO desta transação,     │
 * │    sem tocar a rota validada, e toda redução em `vaga_meta_reducoes`.                          │
 * │ 8. Consultor e recruiter (decisão 7): destino ativo e com o papel de A&S certo.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: este serviço não tem Logger, e nenhuma mensagem de erro repete valor de campo.
 */

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type LinhaDaVaga = typeof vagas.$inferSelect;

/** Os campos do formulário que são coluna de `vagas` com o mesmo nome. */
const COLUNAS_DO_FORMULARIO = [
  "codigo",
  "cargoId",
  "nomeDivulgacao",
  "codCliente",
  "idVacancyPandape",
  "natureza",
  "status",
  "sazonalidade",
  "linhaServicoId",
  "segmentoId",
  "comercialId",
  "posicoesOficiais",
  "posicoesBanco",
  "solicitanteNome",
  "solicitanteTelefone",
  "solicitanteEmail",
  "dataSolicitacao",
  "dataAlinhamento",
  "dataRealinhamento",
  "dataAbertura",
  "dataLimite",
  "envioShortlist",
  "vinculo",
  "tempoContrato",
  "motivo",
  "justificativaMotivo",
  "tipoSubstituicao",
  "substituidoNome",
  "substituidoCpf",
  "salarioAbertura",
  "localTrabalho",
  "cidadeId",
  "regiaoEstado",
  "regioes",
  "regioesOutras",
  "horarioEscala",
  "modeloTrabalho",
  "detalheHibrido",
  "confidencial",
  "divulgarEmpresa",
  "escolaridade",
  "faixaEtaria",
  "genero",
  "idiomasExigidos",
  "idiomasOutros",
  "cursosConhecimentos",
  "testes",
  "testesOutro",
  "experiencia",
  "atribuicoes",
  "perfilComportamental",
  "ambiente",
  "etapasPs",
  "etapasPsOutra",
  "observacoes",
] as const satisfies readonly (keyof CreateVagaDto & keyof LinhaDaVaga)[];

const NUNCA_EDITAVEIS: readonly string[] = AS_VAGA_CAMPOS_NUNCA_EDITAVEIS;

/** O que o corpo pode mudar: o formulário menos o que nunca se edita, mais os dois lados. */
const LISTA_BRANCA: readonly string[] = [
  ...COLUNAS_DO_FORMULARIO.filter((c) => !NUNCA_EDITAVEIS.includes(c)),
  "beneficios",
  "consultorId",
  "recruiterId",
];

/** As colunas que a edição escreve (a trilha menos os dois fatos que não são coluna). */
const COLUNAS_ESCRITAS = VAGA_EDICAO_CAMPOS_DA_TRILHA.filter(
  (c) => c !== "beneficios" && c !== "entrevistasRemovidas",
) as readonly (keyof LinhaDaVaga)[];

const SITUACAO_ENVIADO: CandidaturaSituacao = "ENVIADO_PARA_ADMISSAO";

interface Beneficio {
  beneficioId: string;
  valor: string | null;
}

/** Os benefícios na forma comparável e gravável da trilha: `id:valor`, valor como número. */
function beneficiosComoLista(itens: readonly Beneficio[]): string[] {
  return itens
    .map((b) => {
      const n = b.valor === null || b.valor === "" ? null : Number(b.valor);
      return `${b.beneficioId}:${n === null || !Number.isFinite(n) ? "" : String(n)}`;
    })
    .sort();
}

function recusa(corpo: AsVagaEdicaoNegada): never {
  throw new ConflictException(corpo);
}

function eUuidVazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

@Injectable()
export class VagasEdicaoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly vagas: VagasService,
    private readonly etapas: EtapasFunilService,
    private readonly statusVaga: VagaStatusService,
  ) {}

  // ─── PRÉVIA DA EDIÇÃO ─────────────────────────────────────────────────────────────────────────

  async previa(id: string): Promise<AsVagaEdicaoPrevia> {
    const regua = await this.statusVaga.regua();
    const etapasDeEntrega = await this.etapas.codigosDeEntregaAoCliente();
    const [vaga] = await this.db.select().from(vagas).where(eq(vagas.id, id)).limit(1);
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    const motivoNaoEditavel = this.motivoNaoEditavel(regua, vaga.status);
    const enviados = await this.enviadosParaAdmissao(this.db, id);
    const entrevistas = await this.entrevistasComOCliente(this.db, id, etapasDeEntrega);
    const ocupacao = await this.ocupacao(this.db, id, vaga.posicoesOficiais);

    return {
      vagaId: id,
      editavel: motivoNaoEditavel === null,
      motivoNaoEditavel,
      enviadosParaAdmissao: enviados,
      camposTravadosPelaAdmissao: enviados > 0 ? [...AS_VAGA_CAMPOS_DA_ADMISSAO] : [],
      entrevistasComOCliente: entrevistas,
      posicoesOficiais: vaga.posicoesOficiais,
      posicoesBanco: vaga.posicoesBanco,
      alocados: ocupacao.alocados,
      entregues: ocupacao.entregues,
      consultorId: vaga.consultorId,
      recruiterId: vaga.recruiterId,
    };
  }

  // ─── EDITAR ───────────────────────────────────────────────────────────────────────────────────

  async editar(id: string, dto: EditarVagaDto, porId: string): Promise<AsVagaEdicaoResultado> {
    // O CATÁLOGO ANTES DA TRANSAÇÃO (a régua do `VagasService`): o status da vaga se lê sob a trava.
    const regua = await this.statusVaga.regua();
    const etapasDeEntrega = await this.etapas.codigosDeEntregaAoCliente();
    const corpo = dto as unknown as Record<string, unknown>;

    return this.db.transaction(async (tx) => {
      // ── 1. A LINHA TRAVADA, e o papel conferido DEPOIS da trava.
      const [atual] = await tx.select().from(vagas).where(eq(vagas.id, id)).for("update");
      if (!atual) throw new NotFoundException("Vaga não encontrada.");
      const motivo = this.motivoNaoEditavel(regua, atual.status);
      if (motivo !== null) recusa({ codigo: "VAGA_NAO_EDITAVEL", mensagem: motivo });

      // ── 2. O QUE NUNCA SE EDITA só passa igual ao atual (a tela manda o formulário inteiro).
      const nuncaAlterados = this.nuncaEditaveisAlterados(corpo, atual);

      // ── 3. O RESULTADO: vaga atual + corpo, pelo próprio `camposDaTrilha`.
      const beneficiosAtuais: Beneficio[] = await tx
        .select({ beneficioId: vagaBeneficio.beneficioId, valor: vagaBeneficio.valor })
        .from(vagaBeneficio)
        .where(eq(vagaBeneficio.vagaId, id));
      const formulario = this.formularioDaVaga(atual, beneficiosAtuais);
      const mesclado = this.mesclar(formulario, corpo);

      const mudou = (campo: keyof CreateVagaDto) =>
        campoMudou(campo, (formulario as Record<string, unknown>)[campo], mesclado[campo]);

      // Catálogo só é RECONFERIDO quando o valor muda: o que já está gravado pode ter sido
      // desativado depois, e editar outro campo não pode ser recusado por isso.
      const cidade = await this.vagas.resolverCidade(mesclado.cidadeId);
      const linhaServicoId = mudou("linhaServicoId")
        ? await this.vagas.resolverLinhaServico(mesclado.linhaServicoId)
        : atual.linhaServicoId;
      const herdados = await this.vagas.resolverHerdaveis({
        segmentoId: mudou("segmentoId") ? mesclado.segmentoId : undefined,
        comercialId: mudou("comercialId") ? mesclado.comercialId : undefined,
      } as CreateVagaDto);
      const herdaveis = {
        segmentoId: mudou("segmentoId") ? herdados.segmentoId : atual.segmentoId,
        comercialId: mudou("comercialId") ? herdados.comercialId : atual.comercialId,
      };

      const campos = {
        ...this.vagas.camposDaTrilha(
          regua,
          mesclado,
          atual.status,
          cidade,
          linhaServicoId,
          herdaveis,
        ),
        // Ausente ou nulo NÃO apaga a meta (mesma régua de `metaOficialDaTrilha`).
        posicoesOficiais: mesclado.posicoesOficiais ?? atual.posicoesOficiais,
        posicoesBanco: mesclado.posicoesBanco ?? atual.posicoesBanco,
      };
      this.vagas.travaObrigatorios(regua, campos, atual.status);

      // A UF entra pela lista branca, mas com cidade escolhida quem manda é a cidade
      // (`cidade?.uf ?? dto.regiaoEstado` no `camposDaTrilha`): o corpo só decide sem cidade.
      if (nuncaAlterados.length > 0) {
        recusa({
          codigo: "CAMPO_NUNCA_EDITAVEL",
          mensagem:
            "Este campo não se edita depois da liberação: o código e o número do Pandapé são a identidade da vaga, e o status, a contraparte e o envio da shortlist têm fluxo próprio. Recarregue a página.",
          campos: nuncaAlterados,
        });
      }

      const consultorId = eUuidVazio(mesclado.consultorId) ? null : String(mesclado.consultorId);
      const recruiterId = eUuidVazio(mesclado.recruiterId) ? null : String(mesclado.recruiterId);
      const beneficiosNovos = this.beneficiosDoCorpo(mesclado);

      const resultado: Record<string, unknown> = {};
      for (const c of COLUNAS_ESCRITAS) resultado[c] = (campos as Record<string, unknown>)[c];
      resultado.consultorId = consultorId;
      resultado.recruiterId = recruiterId;
      resultado.beneficios = beneficiosComoLista(beneficiosNovos);

      const comparavelAtual: Record<string, unknown> = {};
      for (const c of COLUNAS_ESCRITAS) comparavelAtual[c] = atual[c];
      comparavelAtual.beneficios = beneficiosComoLista(beneficiosAtuais);

      const alterados = VAGA_EDICAO_CAMPOS_DA_TRILHA.filter(
        (c) =>
          c !== "entrevistasRemovidas" && campoMudou(c, comparavelAtual[c], resultado[c]),
      );

      // ── 4. NADA MUDOU: sucesso, nada gravado (nem `atualizado_em`).
      if (alterados.length === 0) return { vagaId: id, camposAlterados: 0, entrevistasRemovidas: 0 };
      const alterou = (c: string) => (alterados as readonly string[]).includes(c);

      // ── 5. A FRONTEIRA A&S/ADM, no RESULTADO.
      if ((await this.enviadosParaAdmissao(tx, id)) > 0) {
        const travados = camposDaAdmissaoAlterados(comparavelAtual, resultado);
        if (travados.length > 0) {
          recusa({
            codigo: "CAMPO_DA_ADMISSAO",
            mensagem:
              "Esta vaga já tem candidato enviado para a admissão, e os dados que a admissão copia da vaga passaram a ser do ADM. Corrija na admissão, pela tela da Admissão.",
            campos: travados,
          });
        }
      }

      // ── 6. O CLIENTE.
      let entrevistasAApagar: string[] = [];
      if (alterou("codCliente")) {
        const novo = resultado.codCliente as string | null;
        if (!novo) {
          throw new BadRequestException(
            "A vaga liberada não fica sem cliente. Escolha um cliente da lista.",
          );
        }
        await this.vagas.exigirClienteExistente(novo);
        if (atual.codCliente && atual.codCliente !== novo && etapasDeEntrega.size > 0) {
          entrevistasAApagar = await this.idsDasEntrevistasComOCliente(tx, id, etapasDeEntrega);
          if (entrevistasAApagar.length > 0 && dto.confirmarTrocaDeCliente !== true) {
            recusa({
              codigo: "CONFIRMAR_TROCA_DE_CLIENTE",
              mensagem:
                entrevistasAApagar.length === 1
                  ? "Trocar o cliente apaga 1 entrevista marcada com o cliente anterior. Confirme para seguir."
                  : `Trocar o cliente apaga ${entrevistasAApagar.length} entrevistas marcadas com o cliente anterior. Confirme para seguir.`,
              entrevistas: entrevistasAApagar.length,
            });
          }
        }
      }

      // ── 7. AS POSIÇÕES, pela régua de `editarPosicoes`, lida DENTRO desta transação.
      const posicoesMudaram = alterou("posicoesOficiais") || alterou("posicoesBanco");
      if (posicoesMudaram) {
        const ocupacao = await this.ocupacao(tx, id, campos.posicoesOficiais);
        const decisao = decidirPosicoesDaEdicao({
          oficialAtual: atual.posicoesOficiais,
          bancoAtual: atual.posicoesBanco,
          oficialNovo: campos.posicoesOficiais,
          bancoNovo: campos.posicoesBanco,
          alocados: ocupacao.alocados,
          entregues: ocupacao.entregues,
          confirmarAbaixoDoAlocado: dto.confirmarAbaixoDoAlocado === true,
          entreguesPorLado: ocupacao.entreguesPorLado,
          alocadosPorLado: ocupacao.alocadosPorLado,
        });
        if (decisao.tipo === "ABAIXO_DO_ENTREGUE") {
          const excesso = excessoDePosicoes(
            {
              vagasFechadas: ocupacao.entreguesPorLado.oficial,
              vagasFechadasBanco: ocupacao.entreguesPorLado.banco,
            },
            { posicoesOficiais: campos.posicoesOficiais, posicoesBanco: campos.posicoesBanco },
          );
          recusa({
            codigo: "ABAIXO_DO_ENTREGUE",
            mensagem: excesso
              ? this.vagas.mensagemDeExcesso(excesso)
              : "A meta não pode ficar abaixo do que a vaga já entregou.",
            alocados: ocupacao.alocados,
            entregues: ocupacao.entregues,
          });
        }
        if (decisao.tipo === "CONFIRMAR_ABAIXO_DO_ALOCADO") {
          recusa({
            codigo: "CONFIRMAR_ABAIXO_DO_ALOCADO",
            mensagem:
              "A meta nova fica abaixo de quem já está alocado na vaga. Confirme para seguir.",
            alocados: ocupacao.alocados,
            entregues: ocupacao.entregues,
          });
        }
      }

      // ── 8. OS DOIS LADOS.
      // `null` é "sem responsável" (decisão do coordenador, 05/10): aceito e gravado na trilha.
      if (alterou("consultorId") && consultorId) await this.vagas.consultorDeDestino(consultorId);
      if (alterou("recruiterId") && recruiterId) await this.recruiterDeDestino(tx, recruiterId);
      if (alterou("beneficios") && beneficiosNovos.length > 0) {
        await this.vagas.validaBeneficios(
          beneficiosNovos.map((b) => ({ beneficioId: b.beneficioId, valor: b.valor ?? undefined })),
        );
      }

      // ── A ESCRITA: só as colunas que mudaram, mais `atualizado_em`. Status nunca.
      const set: Record<string, unknown> = { atualizadoEm: new Date() };
      for (const c of alterados) {
        if (c === "beneficios") continue;
        set[c] = resultado[c];
      }
      await tx.update(vagas).set(set).where(eq(vagas.id, id));

      if (alterou("beneficios")) {
        await tx.delete(vagaBeneficio).where(eq(vagaBeneficio.vagaId, id));
        if (beneficiosNovos.length > 0) {
          await tx
            .insert(vagaBeneficio)
            .values(beneficiosNovos.map((b) => ({ vagaId: id, beneficioId: b.beneficioId, valor: b.valor })));
        }
      }

      // TODA redução vai para o rastro da meta (o furo de 09/09 volta se ficar só na trilha nova).
      if (posicoesMudaram) {
        const reducao = this.vagas.reducaoDeMeta(atual, {
          posicoesOficiais: campos.posicoesOficiais,
          posicoesBanco: campos.posicoesBanco,
        });
        if (reducao) await tx.insert(vagaMetaReducoes).values({ vagaId: id, ...reducao, porId });
      }

      let entrevistasRemovidas = 0;
      if (alterou("codCliente")) {
        if (entrevistasAApagar.length > 0) {
          const apagadas = await tx
            .delete(asCandidaturaEntrevistas)
            .where(inArray(asCandidaturaEntrevistas.id, entrevistasAApagar))
            .returning({ id: asCandidaturaEntrevistas.id });
          entrevistasRemovidas = apagadas.length;
        }
        await tx.insert(vagaClienteCorrecoes).values({
          vagaId: id,
          deCodCliente: atual.codCliente,
          paraCodCliente: resultado.codCliente as string,
          porId,
        });
      }

      if (alterou("consultorId")) {
        await tx.insert(vagaConsultorTransferencias).values({
          vagaId: id,
          deConsultorId: atual.consultorId,
          paraConsultorId: consultorId,
          porId,
        });
      }

      const linhas = alterados.map((c) => trilhaDoCampo(c, comparavelAtual[c], resultado[c]));
      if (entrevistasRemovidas > 0) {
        linhas.push(trilhaDoCampo("entrevistasRemovidas", null, entrevistasRemovidas));
      }
      await tx.insert(vagaEdicoes).values(linhas.map((l) => ({ vagaId: id, porId, ...l })));

      return { vagaId: id, camposAlterados: alterados.length, entrevistasRemovidas };
    });
  }

  // ─── EXCLUIR ──────────────────────────────────────────────────────────────────────────────────

  async exclusaoPrevia(id: string): Promise<AsVagaExclusaoPrevia> {
    const [vaga] = await this.db
      .select({ id: vagas.id, idVacancyPandape: vagas.idVacancyPandape })
      .from(vagas)
      .where(eq(vagas.id, id))
      .limit(1);
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    const { candidaturas, shortlists } = await this.contagensQueSeguram(this.db, id);
    return {
      vagaId: id,
      podeExcluir: candidaturas === 0 && shortlists === 0,
      candidaturas,
      shortlists,
      voltaPelaVarredura: !!vaga.idVacancyPandape?.trim(),
    };
  }

  async excluir(id: string, porId: string): Promise<{ vagaId: string }> {
    const regua = await this.statusVaga.regua();
    const codigoRevisao = regua.codigoDoPapel("REVISAO");
    const codigoAbertura = regua.codigoDoPapel("ABERTURA");
    try {
      await this.db.transaction(async (tx) => {
        const [vaga] = await tx.select().from(vagas).where(eq(vagas.id, id)).for("update");
        if (!vaga) throw new NotFoundException("Vaga não encontrada.");

        const { candidaturas, shortlists } = await this.contagensQueSeguram(tx, id);
        if (candidaturas > 0 || shortlists > 0) {
          throw new ConflictException({
            mensagem:
              "Esta vaga tem candidatura ou shortlist e não pode ser excluída. Encerre a vaga pelo fluxo de fechar ou cancelar.",
            vagaId: id,
            podeExcluir: false,
            candidaturas,
            shortlists,
            voltaPelaVarredura: !!vaga.idVacancyPandape?.trim(),
          });
        }

        const instantaneo = await this.instantaneo(tx, vaga, codigoRevisao, codigoAbertura);
        await tx.insert(vagaExclusoes).values({
          vagaId: id,
          codigo: vaga.codigo,
          idVacancyPandape: vaga.idVacancyPandape,
          porId,
          instantaneo,
        });
        await tx.delete(vagas).where(eq(vagas.id, id));
      });
    } catch (err) {
      if (ehViolacaoDeFk(err)) {
        throw new ConflictException(
          "Esta vaga tem registros ligados a ela e não pode ser excluída. Recarregue a página.",
        );
      }
      throw err;
    }
    return { vagaId: id };
  }

  // ─── OS RECRUITERS QUE PODEM RECEBER UMA VAGA ────────────────────────────────────────────────

  /**
   * O catálogo do seletor de recruiter da edição: o espelho de `consultoresParaTransferencia`, do
   * outro lado (`contraparteDe("CONSULTOR")`). ATIVOS e com papel de A&S RECRUITER, a MESMA régua
   * de `recruiterDeDestino`. §A.6: id e nome de usuário interno, e mais nada.
   */
  async recrutadores(): Promise<{ id: string; nome: string }[]> {
    return this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(eq(usuarios.ativo, true), eq(usuarios.papelAs, contraparteDe("CONSULTOR"))))
      .orderBy(asc(usuarios.nome));
  }

  // ─── PEÇAS ────────────────────────────────────────────────────────────────────────────────────

  /** Nulo quando a vaga é editável; senão a frase. Só papel ABERTURA ou ENTREGA, nunca encerrada. */
  private motivoNaoEditavel(regua: ReguaDeStatusDaVaga, status: string): string | null {
    if (!regua.existe(status)) {
      return "O status desta vaga não está no catálogo. Recarregue a página.";
    }
    const linha = regua.linha(status);
    if (linha.encerra) {
      return "Esta vaga já foi encerrada e não se edita mais. Para mudar algo, reabra a vaga antes.";
    }
    if (linha.papel === "RASCUNHO") {
      return "Esta vaga é um rascunho: continue pela trilha de abertura.";
    }
    if (linha.papel === "REVISAO") {
      return "Esta vaga está na fila de revisão: edite e libere pela revisão.";
    }
    if (!papelDeVagaEmProcesso(linha.papel)) {
      return "Só a vaga em processo (aberta ou entregue) se edita por aqui.";
    }
    return null;
  }

  /** Os campos que nunca se editam e chegaram DIFERENTES do atual (a UF é conferida depois). */
  private nuncaEditaveisAlterados(corpo: Record<string, unknown>, atual: LinhaDaVaga): string[] {
    const fora: string[] = [];
    const enviado = (c: string) => corpo[c] !== undefined;

    if (enviado("codigo")) {
      const de = atual.codigo ? normalizarCodigoVaga(atual.codigo) : "";
      const para = typeof corpo.codigo === "string" ? normalizarCodigoVaga(corpo.codigo) : "";
      if (de !== para) fora.push("codigo");
    }
    if (enviado("idVacancyPandape") && campoMudou("idVacancyPandape", corpo.idVacancyPandape, atual.idVacancyPandape)) {
      fora.push("idVacancyPandape");
    }
    if (enviado("status") && campoMudou("status", corpo.status, atual.status)) fora.push("status");
    if (enviado("envioShortlist") && campoMudou("envioShortlist", corpo.envioShortlist, atual.envioShortlist)) {
      fora.push("envioShortlist");
    }
    // A CONTRAPARTE foi substituída por consultorId e recruiterId explícitos: igual a um dos dois
    // lados atuais (ou vazia) é a tela devolvendo o que mostrou; outra pessoa é tentativa de troca.
    if (
      !eUuidVazio(corpo.contraparteId) &&
      corpo.contraparteId !== atual.consultorId &&
      corpo.contraparteId !== atual.recruiterId
    ) {
      fora.push("contraparteId");
    }
    return fora;
  }

  /** A vaga gravada na forma do formulário (`CreateVagaDto`), para o `camposDaTrilha`. */
  private formularioDaVaga(atual: LinhaDaVaga, beneficios: readonly Beneficio[]): CreateVagaDto {
    const f: Record<string, unknown> = {};
    for (const c of COLUNAS_DO_FORMULARIO) f[c] = atual[c];
    f.beneficios = beneficios.map((b) => ({ beneficioId: b.beneficioId, valor: b.valor ?? undefined }));
    f.consultorId = atual.consultorId;
    f.recruiterId = atual.recruiterId;
    return f as unknown as CreateVagaDto;
  }

  /**
   * ATUAL + CORPO, só pela lista branca. Campo AUSENTE (`undefined`) não mexe; `null` ou texto vazio
   * limpa. `idiomas` é o apelido de `idiomasExigidos`, como no `camposDaTrilha`.
   */
  private mesclar(
    formulario: CreateVagaDto,
    corpo: Record<string, unknown>,
  ): CreateVagaDto & { consultorId?: string | null; recruiterId?: string | null } {
    const m: Record<string, unknown> = { ...(formulario as unknown as Record<string, unknown>) };
    for (const c of LISTA_BRANCA) {
      if (corpo[c] !== undefined) m[c] = corpo[c];
    }
    if (corpo.idiomasExigidos === undefined && corpo.idiomas !== undefined) {
      m.idiomasExigidos = corpo.idiomas;
    }
    delete m.idiomas;
    return m as unknown as CreateVagaDto & { consultorId?: string | null; recruiterId?: string | null };
  }

  /** Os benefícios do formulário mesclado, um por id (o último vence, como o `validaBeneficios`). */
  private beneficiosDoCorpo(mesclado: CreateVagaDto): Beneficio[] {
    const porId = new Map<string, string | null>();
    for (const b of mesclado.beneficios ?? []) {
      const valor = b.valor === undefined || b.valor === null || String(b.valor).trim() === "" ? null : String(b.valor);
      porId.set(b.beneficioId, valor);
    }
    return [...porId.entries()].map(([beneficioId, valor]) => ({ beneficioId, valor }));
  }

  /** A régua do RECRUITER de destino, o análogo de `consultorDeDestino`. */
  private async recruiterDeDestino(exec: Executor, paraId: string): Promise<void> {
    const [pessoa] = await exec
      .select({ id: usuarios.id, ativo: usuarios.ativo, papelAs: usuarios.papelAs })
      .from(usuarios)
      .where(eq(usuarios.id, paraId))
      .limit(1);
    if (!pessoa) throw new NotFoundException("Recruiter de destino não encontrado.");
    if (!pessoa.ativo) {
      throw new ConflictException(
        "Este usuário está inativo e não recebe vaga. Escolha um recruiter ativo.",
      );
    }
    if (pessoa.papelAs !== contraparteDe("CONSULTOR")) {
      throw new ConflictException(
        "Este usuário não tem papel de Recruiter em A&S. Defina o papel no cadastro de usuários ou escolha outra pessoa.",
      );
    }
  }

  /** Candidaturas da vaga ENVIADAS para a admissão, no estado de AGORA. */
  private async enviadosParaAdmissao(exec: Executor, vagaId: string): Promise<number> {
    const [r] = await exec
      .select({ n: count() })
      .from(asCandidaturas)
      .where(
        and(
          eq(asCandidaturas.vagaId, vagaId),
          or(eq(asCandidaturas.situacao, SITUACAO_ENVIADO), isNotNull(asCandidaturas.admissaoId)),
        ),
      );
    return Number(r?.n ?? 0);
  }

  private async entrevistasComOCliente(
    exec: Executor,
    vagaId: string,
    etapasDeEntrega: ReadonlySet<string>,
  ): Promise<number> {
    return (await this.idsDasEntrevistasComOCliente(exec, vagaId, etapasDeEntrega)).length;
  }

  /**
   * As entrevistas nas etapas de ENTREGA AO CLIENTE de TODAS as candidaturas da vaga: as que a
   * troca de cliente apaga (mesma régua do `trocarVaga`). Conjunto de etapas vazio não apaga nada.
   */
  private async idsDasEntrevistasComOCliente(
    exec: Executor,
    vagaId: string,
    etapasDeEntrega: ReadonlySet<string>,
  ): Promise<string[]> {
    if (etapasDeEntrega.size === 0) return [];
    const linhas = await exec
      .select({ id: asCandidaturaEntrevistas.id })
      .from(asCandidaturaEntrevistas)
      .innerJoin(asCandidaturas, eq(asCandidaturas.id, asCandidaturaEntrevistas.candidaturaId))
      .where(
        and(
          eq(asCandidaturas.vagaId, vagaId),
          inArray(asCandidaturaEntrevistas.etapa, [...etapasDeEntrega]),
        ),
      );
    return linhas.map((l) => l.id);
  }

  /**
   * A OCUPAÇÃO DERIVADA da vaga, pela régua do domínio (`ocupacaoDaVaga`), a mesma de
   * `ocupacaoPorVaga`. A divisão por lado dos ALOCADOS usa as mesmas duas funções do domínio que a
   * ocupação usa por dentro (`consomePosicao` e `ladoDaCandidatura`), não uma régua nova.
   */
  private async ocupacao(
    exec: Executor,
    vagaId: string,
    posicoesOficiais: number | null,
  ): Promise<{
    alocados: number;
    entregues: number;
    entreguesPorLado: { oficial: number; banco: number };
    alocadosPorLado: { oficial: number; banco: number };
  }> {
    const linhas = await exec
      .select({
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
        quantas: sql<number>`count(*)::int`,
      })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, vagaId))
      .groupBy(asCandidaturas.situacao, asCandidaturas.posicaoLado);

    const itens: { situacao: CandidaturaSituacao; posicaoLado: string | null }[] = [];
    for (const l of linhas) {
      for (let i = 0; i < Number(l.quantas); i++) {
        itens.push({ situacao: l.situacao, posicaoLado: l.posicaoLado });
      }
    }
    const o = ocupacaoDaVaga(posicoesOficiais, itens);
    const alocadosBanco = itens.filter(
      (i) => consomePosicao(i.situacao) && ladoDaCandidatura(i.posicaoLado) === "BANCO",
    ).length;
    return {
      alocados: o.ocupadas,
      entregues: o.finalizadas,
      entreguesPorLado: { oficial: o.finalizadasOficial, banco: o.finalizadasBanco },
      alocadosPorLado: { oficial: o.ocupadas - alocadosBanco, banco: alocadosBanco },
    };
  }

  private async contagensQueSeguram(
    exec: Executor,
    vagaId: string,
  ): Promise<{ candidaturas: number; shortlists: number }> {
    const [c] = await exec
      .select({ n: count() })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, vagaId));
    const [s] = await exec
      .select({ n: count() })
      .from(asShortlists)
      .where(eq(asShortlists.vagaId, vagaId));
    return { candidaturas: Number(c?.n ?? 0), shortlists: Number(s?.n ?? 0) };
  }

  /**
   * O INSTANTÂNEO DA EXCLUSÃO, só TIPO FECHADO (§A.6): ids, códigos de catálogo, datas, números e
   * booleanos, mais os fatos que o CASCADE apaga. Nunca nome de divulgação, texto livre ou CPF.
   */
  private async instantaneo(
    exec: Executor,
    vaga: LinhaDaVaga,
    codigoRevisao: string,
    codigoAbertura: string,
  ): Promise<Record<string, unknown>> {
    const quando = (d: Date | null | undefined) => (d ? d.toISOString() : null);

    const [liberacao] = await exec
      .select({ porId: asVagaStatusEventos.porId, em: asVagaStatusEventos.em })
      .from(asVagaStatusEventos)
      .where(
        and(
          eq(asVagaStatusEventos.vagaId, vaga.id),
          eq(asVagaStatusEventos.de, codigoRevisao),
          eq(asVagaStatusEventos.para, codigoAbertura),
        ),
      )
      .orderBy(asVagaStatusEventos.em)
      .limit(1);
    const reducoes = await exec
      .select({
        deOficiais: vagaMetaReducoes.deOficiais,
        paraOficiais: vagaMetaReducoes.paraOficiais,
        deBanco: vagaMetaReducoes.deBanco,
        paraBanco: vagaMetaReducoes.paraBanco,
        porId: vagaMetaReducoes.porId,
        em: vagaMetaReducoes.criadoEm,
      })
      .from(vagaMetaReducoes)
      .where(eq(vagaMetaReducoes.vagaId, vaga.id));
    const trocasDeCliente = await exec
      .select({
        de: vagaClienteCorrecoes.deCodCliente,
        para: vagaClienteCorrecoes.paraCodCliente,
        porId: vagaClienteCorrecoes.porId,
        em: vagaClienteCorrecoes.criadoEm,
      })
      .from(vagaClienteCorrecoes)
      .where(eq(vagaClienteCorrecoes.vagaId, vaga.id));
    const transferencias = await exec
      .select({
        de: vagaConsultorTransferencias.deConsultorId,
        para: vagaConsultorTransferencias.paraConsultorId,
        porId: vagaConsultorTransferencias.porId,
        em: vagaConsultorTransferencias.criadoEm,
      })
      .from(vagaConsultorTransferencias)
      .where(eq(vagaConsultorTransferencias.vagaId, vaga.id));
    const beneficios = await exec
      .select({ beneficioId: vagaBeneficio.beneficioId, valor: vagaBeneficio.valor })
      .from(vagaBeneficio)
      .where(eq(vagaBeneficio.vagaId, vaga.id));

    return {
      vaga: {
        status: vaga.status,
        cargoId: vaga.cargoId,
        codCliente: vaga.codCliente,
        cidadeId: vaga.cidadeId,
        regiaoEstado: vaga.regiaoEstado,
        linhaServicoId: vaga.linhaServicoId,
        segmentoId: vaga.segmentoId,
        comercialId: vaga.comercialId,
        consultorId: vaga.consultorId,
        recruiterId: vaga.recruiterId,
        abertoPorId: vaga.abertoPorId,
        natureza: vaga.natureza,
        vinculo: vaga.vinculo,
        sazonalidade: vaga.sazonalidade,
        escolaridade: vaga.escolaridade,
        modeloTrabalho: vaga.modeloTrabalho,
        posicoesOficiais: vaga.posicoesOficiais,
        posicoesBanco: vaga.posicoesBanco,
        salarioAbertura: vaga.salarioAbertura,
        dataAbertura: vaga.dataAbertura,
        dataLimite: vaga.dataLimite,
        dataFechamento: vaga.dataFechamento,
        confidencial: vaga.confidencial,
        criadoEm: quando(vaga.criadoEm),
        encerradaEm: quando(vaga.encerradaEm),
      },
      liberacao: liberacao ? { porId: liberacao.porId, em: quando(liberacao.em) } : null,
      reducoesDeMeta: reducoes.map((r) => ({ ...r, em: quando(r.em) })),
      trocasDeCliente: trocasDeCliente.map((t) => ({ ...t, em: quando(t.em) })),
      transferenciasDeConsultor: transferencias.map((t) => ({ ...t, em: quando(t.em) })),
      beneficios,
    };
  }
}

/** Erro 23503 do Postgres (FK), direto ou embrulhado pelo drizzle em `cause`. */
function ehViolacaoDeFk(err: unknown): boolean {
  const codigo = (e: unknown) =>
    e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
  if (codigo(err) === "23503") return true;
  const causa = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  return codigo(causa) === "23503";
}
