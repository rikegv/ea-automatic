import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatoAlteracoesLog,
  candidatos,
  cargos,
  clientes,
  salaEspera,
  salaEsperaStatus,
} from "../db/schema";
import type { SalaEsperaDto, SalaEsperaStatusDto } from "./sala-espera.dto";
import type { AuthUser } from "../auth/auth.types";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";

/**
 * SALA DE ESPERA: o candidato anunciado pelo cliente ou pela Seleção ANTES de se candidatar no
 * Pandapé. É PRÉ-PROCESSO, e a fase que hoje é invisível para a diretoria.
 *
 * NÃO É ADMISSÃO, e a tabela é própria justamente por isso: o registro não tem CPF, e `admissoes`
 * exige um (a chave de `candidatos` é o próprio CPF). Nada aqui toca a esteira.
 *
 * A FILA MOSTRA SÓ O QUE ESTÁ EM ABERTO, e "aberto" tem duas condições, não uma:
 *  - o status NÃO é terminal (`encerra = false`), e
 *  - o registro ainda não foi VINCULADO a uma admissão (`admissao_id IS NULL`).
 * A segunda só passa a acontecer na onda 3 (match manual), mas o filtro já nasce completo: deixar
 * para depois seria plantar o vazamento e esperar alguém notar.
 *
 * §A.6: nome e telefone do candidato são dados pessoais, mas não há CPF nem documento. Nenhum deles
 * vai para log.
 */
@Injectable()
export class SalaEsperaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ── Catálogo de status (Gerencial) ────────────────────────────────────────

  /** Todos os status, inclusive inativos: é a tela de manutenção do catálogo. */
  listarStatus() {
    return this.db
      .select()
      .from(salaEsperaStatus)
      .orderBy(asc(salaEsperaStatus.ordem), asc(salaEsperaStatus.nome));
  }

  /** Só os ATIVOS, para os seletores da tela da Sala. */
  listarStatusAtivos() {
    return this.db
      .select({
        id: salaEsperaStatus.id,
        nome: salaEsperaStatus.nome,
        encerra: salaEsperaStatus.encerra,
      })
      .from(salaEsperaStatus)
      .where(eq(salaEsperaStatus.ativo, true))
      .orderBy(asc(salaEsperaStatus.ordem), asc(salaEsperaStatus.nome));
  }

  async criarStatus(dto: SalaEsperaStatusDto) {
    const [row] = await this.db
      .insert(salaEsperaStatus)
      .values({
        nome: dto.nome.trim(),
        encerra: dto.encerra ?? false,
        ativo: dto.ativo ?? true,
        ordem: dto.ordem ?? 0,
      })
      .returning();
    return row;
  }

  async atualizarStatus(id: string, dto: Partial<SalaEsperaStatusDto>) {
    const [row] = await this.db
      .update(salaEsperaStatus)
      .set({
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.encerra !== undefined ? { encerra: dto.encerra } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        ...(dto.ordem !== undefined ? { ordem: dto.ordem } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(salaEsperaStatus.id, id))
      .returning();
    if (!row) throw new NotFoundException("Status não encontrado.");
    return row;
  }

  // ── Registros da Sala ─────────────────────────────────────────────────────

  /**
   * A fila, em três recortes. O padrão (`aguardando`) é só o trabalho em aberto, para a tela não
   * poluir; `vinculadas` é a aba nova, o histórico de quem já virou admissão; `todos` abre tudo.
   *
   * VINCULADAS é aba, não sumiço (conceito de hospital, decisão do diretor): quem foi vinculado sai
   * da fila ativa mas continua consultável, com a data do vínculo. Antes daqui o registro
   * simplesmente desaparecia da tela, e o time perdia a prova de que aquele candidato foi anunciado
   * antes de aparecer no Pandapé, que é a razão de a Sala existir.
   */
  async listar(recorte: "aguardando" | "vinculadas" | "todos" = "aguardando") {
    const base = this.db
      .select({
        id: salaEspera.id,
        nome: salaEspera.nome,
        telefone: salaEspera.telefone,
        cpf: salaEspera.cpf,
        dataNascimento: salaEspera.dataNascimento,
        email: salaEspera.email,
        dataRecebimento: salaEspera.dataRecebimento,
        origem: salaEspera.origem,
        codCliente: salaEspera.codCliente,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoId: salaEspera.cargoId,
        cargoNome: cargos.nome,
        statusId: salaEspera.statusId,
        statusNome: salaEsperaStatus.nome,
        statusEncerra: salaEsperaStatus.encerra,
        admissaoId: salaEspera.admissaoId,
        vinculadoEm: salaEspera.vinculadoEm,
        criadoEm: salaEspera.criadoEm,
      })
      .from(salaEspera)
      .innerJoin(salaEsperaStatus, eq(salaEsperaStatus.id, salaEspera.statusId))
      .leftJoin(clientes, eq(clientes.codCliente, salaEspera.codCliente))
      .leftJoin(cargos, eq(cargos.id, salaEspera.cargoId));

    if (recorte === "todos") return base.orderBy(asc(salaEspera.dataRecebimento));
    if (recorte === "vinculadas") {
      // Mais recente primeiro: o vínculo de agora é o que se confere.
      return base.where(isNotNull(salaEspera.admissaoId)).orderBy(desc(salaEspera.vinculadoEm));
    }
    return base
      .where(and(eq(salaEsperaStatus.encerra, false), isNull(salaEspera.admissaoId)))
      .orderBy(asc(salaEspera.dataRecebimento));
  }

  // ── MATCH MANUAL com a Liberação (onda 3) ─────────────────────────────────

  /**
   * CANDIDATOS DA SALA que podem casar com uma admissão que chegou do Pandapé.
   *
   * A ORDEM DAS PISTAS É A ORDEM DA CONFIANÇA, e é isso que o `score` expressa:
   *  1. CPF igual: identidade, não semelhança. Quando os dois lados têm CPF e ele bate, não há o que
   *     discutir, e o operador confirma em vez de procurar.
   *  2. telefone igual (só dígitos, para máscara diferente não atrapalhar);
   *  3. nome parecido.
   *
   * Devolve SUGESTÕES, nunca decide: quem associa é o operador (decisão do diretor, match manual). O
   * `score` só ordena a lista, para o caso óbvio aparecer primeiro.
   *
   * Só registros EM ABERTO entram: os mesmos dois critérios da fila (status não terminal e ainda não
   * vinculado). Sugerir um registro já vinculado convidaria a vincular duas vezes.
   *
   * §A.6: recebe CPF e telefone como critério e devolve o registro da Sala, que é o que o operador
   * precisa ler para decidir. Nada disso vai para log.
   */
  async buscarParaMatch(criterios: { cpf?: string; nome?: string; telefone?: string }) {
    const cpf = normalizeCpf(criterios.cpf ?? "");
    const nome = criterios.nome?.trim() ?? "";
    const telefone = (criterios.telefone ?? "").replace(/\D/g, "");

    const pistas = [];
    if (cpf.length === 11) pistas.push(eq(salaEspera.cpf, cpf));
    if (telefone.length >= 8) {
      pistas.push(sql`regexp_replace(coalesce(${salaEspera.telefone}, ''), '\\D', '', 'g') = ${telefone}`);
    }
    if (nome.length >= 3) pistas.push(ilike(salaEspera.nome, `%${nome}%`));
    // Sem pista nenhuma não se devolve a fila inteira: seria convite a vincular o registro errado.
    if (pistas.length === 0) return [];

    const score = sql<number>`(
      case when ${salaEspera.cpf} is not null and ${salaEspera.cpf} = ${cpf} then 100 else 0 end +
      case when regexp_replace(coalesce(${salaEspera.telefone}, ''), '\\D', '', 'g') = ${telefone}
           and ${telefone} <> '' then 10 else 0 end
    )`;

    return this.db
      .select({
        id: salaEspera.id,
        nome: salaEspera.nome,
        telefone: salaEspera.telefone,
        cpf: salaEspera.cpf,
        dataNascimento: salaEspera.dataNascimento,
        email: salaEspera.email,
        dataRecebimento: salaEspera.dataRecebimento,
        origem: salaEspera.origem,
        codCliente: salaEspera.codCliente,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoId: salaEspera.cargoId,
        cargoNome: cargos.nome,
        statusNome: salaEsperaStatus.nome,
        score,
      })
      .from(salaEspera)
      .innerJoin(salaEsperaStatus, eq(salaEsperaStatus.id, salaEspera.statusId))
      .leftJoin(clientes, eq(clientes.codCliente, salaEspera.codCliente))
      .leftJoin(cargos, eq(cargos.id, salaEspera.cargoId))
      .where(
        and(
          eq(salaEsperaStatus.encerra, false),
          isNull(salaEspera.admissaoId),
          or(...pistas),
        ),
      )
      .orderBy(desc(score), asc(salaEspera.dataRecebimento))
      .limit(20);
  }

  /**
   * VINCULA o registro da Sala à admissão, e o registro SAI DA FILA na mesma transação.
   *
   * TRANSACIONAL de propósito: gravar o ponteiro sem baixar da fila (ou o contrário) deixaria o mesmo
   * candidato aparecendo nos dois lugares, que é exatamente o que a fila existe para evitar.
   *
   * IDEMPOTÊNCIA COM RECUSA, não silenciosa: registro já vinculado devolve erro em vez de repontar.
   * Repontar em silêncio permitiria mover o histórico de uma admissão para outra sem ninguém ver.
   *
   * CLIENTE E CARGO ele NÃO escreve: vão para o formulário da liberação, que é quem grava na
   * admissão, pelo caminho que já existe e já é validado. O `liberar()` não foi tocado.
   *
   * TELEFONE é a exceção, e por um motivo concreto: o modal de liberação NÃO TEM caixa de telefone
   * (a tela só o exibe como coluna), então não havia onde "pré-preencher". A regra do diretor
   * (entra só se estiver vazio) é aplicada aqui, na mesma transação do vínculo, e SÓ quando o
   * candidato está sem telefone. Telefone já preenchido nunca é sobrescrito.
   */
  /**
   * `prePreencherAdmissao` é a diferença entre as DUAS portas do match, e é aditivo de propósito
   * (§A.26).
   *
   *  - Porta da LIBERAÇÃO (onda 3, `false`, o padrão): o vínculo NÃO escreve na admissão. O que a
   *    Sala sabe volta para o FORMULÁRIO aberto, e quem grava é o `liberar()`, pelo caminho que já
   *    existe e já foi validado. Nada mudou desse lado.
   *  - Porta da SALA (`true`): não há formulário aberto para pré-preencher, a admissão está lá na
   *    fila da Liberação esperando alguém. Então o cliente e o cargo da Sala entram na admissão
   *    AGORA, e SÓ NOS CAMPOS VAZIOS.
   *
   * O QUE ELE CONTINUA NÃO FAZENDO, nas duas portas: não libera, não cria frente, não mexe em farol.
   * Vincular é sugestão de preenchimento, não passagem de fase. Quem libera é o time, na tela de
   * Liberação, como sempre foi.
   */
  async vincular(
    salaId: string,
    admissaoId: string,
    user: AuthUser,
    opts: { prePreencherAdmissao?: boolean } = {},
  ) {
    const [reg] = await this.db.select().from(salaEspera).where(eq(salaEspera.id, salaId));
    if (!reg) throw new NotFoundException("Registro da Sala de Espera não encontrado.");
    if (reg.admissaoId) {
      throw new BadRequestException("Este registro já foi vinculado a uma admissão.");
    }
    const [adm] = await this.db
      .select({
        id: admissoes.id,
        candidatoCpf: admissoes.candidatoCpf,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .where(eq(admissoes.id, admissaoId));
    if (!adm) throw new NotFoundException("Admissão não encontrada.");

    const agora = new Date();
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(salaEspera)
        .set({ admissaoId, vinculadoEm: agora, atualizadoEm: agora })
        .where(and(eq(salaEspera.id, salaId), isNull(salaEspera.admissaoId)))
        .returning();
      // A corrida de dois operadores no mesmo registro cai aqui: o `isNull` acima não casa na segunda
      // vez, e a transação inteira volta atrás.
      if (!row) throw new BadRequestException("Este registro já foi vinculado a uma admissão.");

      // TRILHA: de onde veio e desde quando esperava. É o dado que hoje se perde, e o motivo de o
      // diretor querer a Sala. §A.6: data e origem, sem PII.
      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId,
        campo: "salaEspera",
        valorAnterior: null,
        valorNovo: `Vinculado à Sala de Espera (origem ${reg.origem === "CLIENTE" ? "Cliente" : "Seleção"}, recebido em ${reg.dataRecebimento})`,
        autorId: user?.id ?? null,
      });

      // CLIENTE E CARGO, SÓ SE VAZIOS (porta da Sala). A admissão que chega do Pandapé NASCE SEM
      // CLIENTE, então este é o campo que o vínculo tem a oferecer, e é o que faz a Liberação abrir
      // já sabendo de quem é o candidato. O `isNull` no WHERE repete a condição: se alguém preencher
      // entre a leitura e a escrita, o valor da pessoa prevalece.
      if (opts.prePreencherAdmissao) {
        const campos: Record<string, unknown> = {};
        if (!adm.codCliente) campos.codCliente = reg.codCliente;
        if (!adm.cargoId) campos.cargoId = reg.cargoId;
        if (Object.keys(campos).length > 0) {
          const [tocada] = await tx
            .update(admissoes)
            .set({ ...campos, atualizadoEm: agora })
            .where(
              and(
                eq(admissoes.id, admissaoId),
                ...(campos.codCliente ? [isNull(admissoes.codCliente)] : []),
                ...(campos.cargoId ? [isNull(admissoes.cargoId)] : []),
              ),
            )
            .returning({ id: admissoes.id });
          // A trilha diz de onde veio a sugestão, para ninguém achar que o cliente caiu do céu.
          if (tocada && campos.codCliente) {
            await tx.insert(candidatoAlteracoesLog).values({
              admissaoId,
              campo: "codCliente",
              valorAnterior: null,
              valorNovo: `${String(campos.codCliente)} (sugerido pela Sala de Espera)`,
              autorId: user?.id ?? null,
            });
          }
        }
      }

      // TELEFONE, SÓ SE VAZIO. A leitura acontece DENTRO da transação e o UPDATE repete a condição
      // no WHERE: assim, se alguém preencher o telefone entre a leitura e a escrita, o update não
      // casa e o valor do consultor prevalece. Preencher o que está vazio é ajuda; sobrescrever o
      // que alguém digitou seria perda de dado.
      const telefoneSala = (reg.telefone ?? "").trim();
      if (telefoneSala) {
        const [cand] = await tx
          .select({ telefone: candidatos.telefone })
          .from(candidatos)
          .where(eq(candidatos.cpf, adm.candidatoCpf));
        if (cand && !(cand.telefone ?? "").trim()) {
          const [tel] = await tx
            .update(candidatos)
            .set({ telefone: telefoneSala, atualizadoEm: agora })
            .where(
              and(
                eq(candidatos.cpf, adm.candidatoCpf),
                or(isNull(candidatos.telefone), eq(candidatos.telefone, "")),
              ),
            )
            .returning({ cpf: candidatos.cpf });
          // Mesma trilha das demais edições do candidato (campo "telefone"), para a alteração não
          // aparecer do nada na ficha. Valor anterior vazio, que é a condição para chegar aqui.
          if (tel) {
            await tx.insert(candidatoAlteracoesLog).values({
              admissaoId,
              campo: "telefone",
              valorAnterior: null,
              valorNovo: telefoneSala,
              autorId: user?.id ?? null,
            });
          }
        }
      }

      return row;
    });
  }

  /**
   * Dados do registro para a tela PRÉ-PREENCHER. Devolve o que a Sala sabe; a decisão de usar ou não
   * cada campo é da tela, que só preenche o que estiver VAZIO (decisão do diretor).
   */
  async dadosParaPreencher(salaId: string) {
    const [reg] = await this.db
      .select({
        codCliente: salaEspera.codCliente,
        cargoId: salaEspera.cargoId,
        telefone: salaEspera.telefone,
      })
      .from(salaEspera)
      .where(eq(salaEspera.id, salaId));
    if (!reg) throw new NotFoundException("Registro da Sala de Espera não encontrado.");
    return reg;
  }

  /**
   * AS ADMISSÕES DA FILA DE LIBERAÇÃO, para o match partindo da SALA.
   *
   * SEM FILTRO DE CLIENTE, e isso não é esquecimento: a admissão que chega do Pandapé **nasce sem
   * cliente** (o cliente é justamente o que o time atribui na liberação). Filtrar por cliente aqui
   * esconderia todo mundo. A identificação é NOME + CPF + NASCIMENTO, e a busca é por esses campos.
   *
   * Mesma fonte da tela de Liberação (`farol = AGUARDANDO_LIBERACAO`), mas servida pela rota da
   * Sala: quem tem o menu `sala-espera` precisa enxergar esta lista sem depender do menu da
   * Liberação (§A.23, a permissão é do diretor, e a fábrica não empresta menu).
   */
  async admissoesParaVincular(busca?: string) {
    const termo = (busca ?? "").trim();
    const digitos = termo.replace(/\D/g, "");
    const filtros = [eq(admissoes.farolGlobal, "AGUARDANDO_LIBERACAO")];
    if (termo.length >= 2) {
      const porNome = ilike(candidatos.nome, `%${termo}%`);
      // CPF com ou sem pontuação: compara só os dígitos dos dois lados.
      const porCpf = digitos.length >= 3 ? [ilike(candidatos.cpf, `%${digitos}%`)] : [];
      filtros.push(or(porNome, ...porCpf)!);
    }
    return this.db
      .select({
        admissaoId: admissoes.id,
        nome: candidatos.nome,
        cpf: candidatos.cpf,
        dataNascimento: candidatos.dataNascimento,
        telefone: candidatos.telefone,
        origem: admissoes.origem,
        criadoEm: admissoes.criadoEm,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(and(...filtros))
      .orderBy(asc(admissoes.criadoEm))
      .limit(200);
  }

  async criar(dto: SalaEsperaDto, user: AuthUser) {
    await this.validarReferencias(dto);
    const [row] = await this.db
      .insert(salaEspera)
      .values({
        nome: dto.nome.trim(),
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        telefone: dto.telefone?.trim() || null,
        cpf: this.cpfOuNulo(dto.cpf),
        dataNascimento: dto.dataNascimento || null,
        email: dto.email?.trim() || null,
        dataRecebimento: dto.dataRecebimento,
        origem: dto.origem,
        statusId: dto.statusId,
        criadoPorId: user?.id ?? null,
      })
      .returning();
    return row;
  }

  async atualizar(id: string, dto: SalaEsperaDto) {
    await this.validarReferencias(dto);
    const [row] = await this.db
      .update(salaEspera)
      .set({
        nome: dto.nome.trim(),
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        telefone: dto.telefone?.trim() || null,
        cpf: this.cpfOuNulo(dto.cpf),
        dataNascimento: dto.dataNascimento || null,
        email: dto.email?.trim() || null,
        dataRecebimento: dto.dataRecebimento,
        origem: dto.origem,
        statusId: dto.statusId,
        atualizadoEm: new Date(),
      })
      .where(eq(salaEspera.id, id))
      .returning();
    if (!row) throw new NotFoundException("Registro não encontrado.");
    return row;
  }

  /**
   * CPF normalizado, ou `null` quando não veio. Vazio é caso NORMAL aqui (o candidato ainda não se
   * candidatou), mas CPF PREENCHIDO E INVÁLIDO é erro: o match da onda 3 casaria pela identidade
   * errada, que é pior do que não casar. §A.6: a mensagem não repete o valor recebido.
   */
  private cpfOuNulo(bruto?: string): string | null {
    const cpf = normalizeCpf(bruto ?? "");
    if (!cpf) return null;
    if (!isValidCpf(cpf)) throw new BadRequestException("CPF inválido.");
    return cpf;
  }

  /**
   * Cliente, cargo e status precisam existir. A checagem é explícita para o erro chegar legível na
   * tela, em vez de um 500 de chave estrangeira.
   */
  private async validarReferencias(dto: SalaEsperaDto) {
    const [cli] = await this.db
      .select({ cod: clientes.codCliente })
      .from(clientes)
      .where(eq(clientes.codCliente, dto.codCliente));
    if (!cli) throw new BadRequestException("Cliente não encontrado.");
    const [carg] = await this.db.select({ id: cargos.id }).from(cargos).where(eq(cargos.id, dto.cargoId));
    if (!carg) throw new BadRequestException("Cargo não encontrado.");
    const [st] = await this.db
      .select({ id: salaEsperaStatus.id })
      .from(salaEsperaStatus)
      .where(eq(salaEsperaStatus.id, dto.statusId));
    if (!st) throw new BadRequestException("Status não encontrado.");
  }
}
