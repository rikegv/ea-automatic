import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { and, count, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  cargos,
  clientes,
  dadosVagaFolha,
  documentosAdmissao,
  frentesAdmissao,
  reguaDocumental,
} from "../db/schema";
import {
  calcSinalizadorPreenchimento,
  STATUS_INICIAL_FRENTE,
} from "../domain/admissao";
import { FRENTES_AO_NASCER } from "../domain/frentes";
import type { CreateAdmissaoDto } from "./dto/create-admissao.dto";

@Injectable()
export class AdmissoesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
  async create(dto: CreateAdmissaoDto) {
    // a. validação de CPF (F3) — chave técnica de identidade.
    const cpf = normalizeCpf(dto.candidato.cpf);
    if (!isValidCpf(cpf)) {
      throw new BadRequestException("CPF inválido");
    }

    return this.db.transaction(async (tx) => {
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
        })
        .onConflictDoNothing({ target: candidatos.cpf });

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
      const sinalizadorPreenchimento = calcSinalizadorPreenchimento({
        candidato: { nome: dto.candidato.nome, cpf },
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato,
        vagaFolha: { salario: dto.vagaFolha?.salario },
      });

      // f. admissão (entidade central).
      const [admissao] = await tx
        .insert(admissoes)
        .values({
          candidatoCpf: cpf,
          codCliente: dto.codCliente,
          cargoId: dto.cargoId,
          tipoContrato: dto.tipoContrato ?? null,
          dataAdmissao: dto.dataAdmissao ?? null,
          sinalizadorPreenchimento,
        })
        .returning({ id: admissoes.id });

      const admissaoId = admissao.id;

      // g. dados de vaga/folha (1:1).
      await tx.insert(dadosVagaFolha).values({
        admissaoId,
        salario: dto.vagaFolha?.salario ?? null,
        beneficios: dto.vagaFolha?.beneficios ?? null,
        escala: dto.vagaFolha?.escala ?? null,
        centroCusto: dto.vagaFolha?.centroCusto ?? null,
        departamento: dto.vagaFolha?.departamento ?? null,
        gestorBp: dto.vagaFolha?.gestorBp ?? null,
        motivo: dto.vagaFolha?.motivo ?? null,
        tempoContrato: dto.vagaFolha?.tempoContrato ?? null,
        endereco: dto.vagaFolha?.endereco ?? null,
      });

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

      return {
        admissaoId,
        sinalizadorPreenchimento,
        frentes: [...FRENTES_AO_NASCER],
        documentos: exigidos.length,
      };
    });
  }
}
