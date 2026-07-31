import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { assinanteEmpresa, clientes } from "../db/schema";
import {
  cpfValido,
  emailValido,
  nomeSignatarioValido,
  resolverAssinantes,
  soDigitos,
  type AssinanteEmpresa,
} from "../domain/assinante-empresa";

/** Uma linha da tela de cadastro. §A.6: o CPF sai MASCARADO para a tela; o cru fica no banco. */
export interface LinhaAssinante {
  id: string;
  /** `null` = o PADRÃO. */
  codCliente: string | null;
  clienteNome: string | null;
  nome: string;
  email: string;
  /** CPF mascarado para exibição, ex.: "***.444.777-**". A tela nunca recebe o CPF completo. */
  cpfMascarado: string;
  /** Ordem de assinatura no escopo. Mesma ordem = paralelo; diferentes = sequência. */
  ordem: number;
  ativo: boolean;
}

export interface SalvarAssinanteInput {
  /** Presente quando a pessoa já existe no conjunto (edição); ausente cria. */
  id?: string;
  nome: string;
  email: string;
  /** Vazio numa pessoa que já existe = manter o CPF gravado. Em pessoa nova, o service recusa. */
  cpf?: string;
  ordem?: number;
  ativo?: boolean;
}

/** Mascara para exibição (§A.6): mostra só os 6 do meio, igual ao motor do kit. */
function mascarar(cpf: string): string {
  const d = soDigitos(cpf);
  if (d.length !== 11) return "não informado";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/**
 * ASSINANTE DA EMPRESA (INT-4): cadastro e resolução de quem assina o contrato pela empresa.
 *
 * Modelo PADRÃO + EXCEÇÃO POR CLIENTE, igual à pasta-pai do Drive. A precedência mora em
 * `domain/assinante-empresa.resolverAssinante` (função pura, testada sem banco); aqui é só I/O.
 *
 * §A.6: o CPF do representante é PII. É persistido por necessidade (a Clicksign exige documentação do
 * signatário) e NUNCA é logado nem devolvido inteiro à tela.
 */
@Injectable()
export class AssinanteEmpresaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * O CONJUNTO que assina pela empresa nesta admissão, já na ordem. Lista vazia quando não há
   * representante nem do cliente nem padrão: o chamador NÃO monta o envelope.
   */
  async resolverConjunto(
    codCliente: string | null | undefined,
    clienteVinculoId?: string | null,
  ): Promise<AssinanteEmpresa[]> {
    const rows = await this.db
      .select({
        codCliente: assinanteEmpresa.codCliente,
        nome: assinanteEmpresa.nome,
        email: assinanteEmpresa.email,
        cpf: assinanteEmpresa.cpf,
        ordem: assinanteEmpresa.ordem,
        ativo: assinanteEmpresa.ativo,
        clienteVinculoId: assinanteEmpresa.clienteVinculoId,
      })
      .from(assinanteEmpresa);
    return resolverAssinantes(rows, codCliente, clienteVinculoId);
  }

  /** Lista todos os representantes para a tela (CPF mascarado), padrão primeiro e por ordem. */
  async listar(): Promise<LinhaAssinante[]> {
    const rows = await this.db
      .select({
        id: assinanteEmpresa.id,
        codCliente: assinanteEmpresa.codCliente,
        clienteNome: clientes.nomeOperacao,
        nome: assinanteEmpresa.nome,
        email: assinanteEmpresa.email,
        cpf: assinanteEmpresa.cpf,
        ordem: assinanteEmpresa.ordem,
        ativo: assinanteEmpresa.ativo,
      })
      .from(assinanteEmpresa)
      .leftJoin(clientes, eq(assinanteEmpresa.codCliente, clientes.codCliente))
      .orderBy(asc(assinanteEmpresa.ordem), asc(assinanteEmpresa.nome));

    return rows
      .map((r) => ({
        id: r.id,
        codCliente: r.codCliente,
        clienteNome: r.clienteNome,
        nome: r.nome,
        email: r.email,
        cpfMascarado: mascarar(r.cpf),
        ordem: r.ordem,
        ativo: r.ativo,
      }))
      // O escopo PADRÃO encabeça a lista (é a regra geral); dentro de cada escopo, a ordem manda.
      .sort((a, b) => {
        if (a.codCliente === null && b.codCliente !== null) return -1;
        if (b.codCliente === null && a.codCliente !== null) return 1;
        const escopo = (a.codCliente ?? "").localeCompare(b.codCliente ?? "");
        return escopo !== 0 ? escopo : a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");
      });
  }

  /**
   * Valida o que é comum a criar e editar. A régua é deliberadamente mais dura que a da API:
   *
   *  - NOME no formato que a Clicksign aceita (nome e sobrenome, sem dígito);
   *  - E-MAIL bem formado, porque é o canal de autenticação do requirement;
   *  - CPF OBRIGATÓRIO e com dígito verificador conferido. A API aceitaria signatário sem
   *    documentação (provado na sondagem), mas a assinatura com CPF é mais forte juridicamente, e
   *    esta é decisão do diretor, não limitação técnica.
   *
   * Barrar aqui evita que o erro apareça só no disparo do envelope, com o kit já gerado.
   */
  private validar(input: SalvarAssinanteInput) {
    const nome = (input.nome ?? "").trim();
    const email = (input.email ?? "").trim();
    const cpf = soDigitos(input.cpf);
    const ordem = Math.trunc(Number(input.ordem ?? 1));

    if (!nomeSignatarioValido(nome)) {
      throw new BadRequestException(
        "Informe nome e sobrenome do representante, apenas letras. A Clicksign recusa nome com " +
          "número ou com uma palavra só.",
      );
    }
    if (!emailValido(email)) throw new BadRequestException("E-mail do representante inválido.");
    if (!cpfValido(cpf)) {
      // A mensagem não repete o CPF digitado (§A.6: PII não volta em texto de erro nem em log).
      throw new BadRequestException(
        "CPF do representante inválido. O CPF é obrigatório e precisa ter dígito verificador válido.",
      );
    }
    if (!Number.isFinite(ordem) || ordem < 1) {
      throw new BadRequestException("A ordem de assinatura precisa ser 1 ou maior.");
    }
    return { nome, email, cpf, ordem, ativo: input.ativo ?? true };
  }

  /**
   * SALVA O CONJUNTO INTEIRO de um escopo de uma vez (padrão quando `codCliente` vem vazio).
   *
   * POR QUE É UM SÓ e não um cadastro por pessoa: o que a operação gerencia é o CONJUNTO que assina
   * por um cliente, com a ordem entre as pessoas. Cadastrar de um em um obrigava a sair e voltar para
   * cada representante, e a ordem virava um número digitado à parte, sem o conjunto à vista.
   *
   * SUBSTITUIÇÃO COMPLETA e TRANSACIONAL: quem não vem na lista é removido, quem vem com `id` é
   * atualizado, quem vem sem `id` é criado. Ou o conjunto inteiro entra, ou nada entra; um escopo
   * salvo pela metade deixaria a ordem de assinatura inconsistente.
   *
   * Lista VAZIA remove o escopo inteiro, que é como se apaga um conjunto.
   */
  async salvarConjunto(
    codCliente: string | null | undefined,
    itens: SalvarAssinanteInput[],
  ): Promise<LinhaAssinante[]> {
    const cod = (codCliente ?? "").trim() || null;
    if (cod) {
      const cliente = await this.db.query.clientes.findFirst({
        where: eq(clientes.codCliente, cod),
      });
      if (!cliente) throw new BadRequestException(`Cliente ${cod} não existe no catálogo.`);
    }

    // CPF EM BRANCO numa pessoa que já existe = MANTER o gravado. A tela nunca recebe o CPF
    // completo de volta (§A.6: sai mascarado), então exigir que o consultor redigite o CPF de todo
    // mundo a cada edição seria transformar uma limitação de privacidade em trabalho manual.
    const atuaisPorId = new Map<string, string>();
    const existentes = await this.db
      .select({ id: assinanteEmpresa.id, cpf: assinanteEmpresa.cpf })
      .from(assinanteEmpresa)
      .where(cod ? eq(assinanteEmpresa.codCliente, cod) : isNull(assinanteEmpresa.codCliente));
    for (const e of existentes) atuaisPorId.set(e.id, e.cpf);

    // Valida TUDO antes de tocar o banco: erro no terceiro item não pode deixar os dois primeiros
    // gravados. A mensagem diz de qual pessoa é o problema, senão o consultor não sabe qual corrigir.
    const validados = (itens ?? []).map((item, i) => {
      const id = (item as { id?: string }).id;
      const cpfInformado = soDigitos(item?.cpf);
      const cpf = cpfInformado || (id ? (atuaisPorId.get(id) ?? "") : "");
      try {
        return { ...this.validar({ ...item, cpf }), id };
      } catch (err) {
        const motivo = err instanceof BadRequestException ? err.message : "dado inválido";
        const quem = (item?.nome ?? "").trim() || `pessoa ${i + 1}`;
        throw new BadRequestException(`${quem}: ${motivo}`);
      }
    });

    // A MESMA PESSOA não entra duas vezes no conjunto. O índice do banco também barra, mas aqui a
    // mensagem consegue dizer o nome de quem duplicou.
    const vistos = new Set<string>();
    for (const v of validados) {
      if (vistos.has(v.cpf)) {
        throw new BadRequestException(
          `${v.nome} está repetido neste conjunto. Cada pessoa entra uma vez só.`,
        );
      }
      vistos.add(v.cpf);
    }

    await this.db.transaction(async (tx) => {
      const atuais = await tx
        .select({ id: assinanteEmpresa.id })
        .from(assinanteEmpresa)
        .where(cod ? eq(assinanteEmpresa.codCliente, cod) : isNull(assinanteEmpresa.codCliente));

      const mantidos = new Set(validados.map((v) => v.id).filter(Boolean) as string[]);
      const remover = atuais.filter((a) => !mantidos.has(a.id)).map((a) => a.id);
      if (remover.length > 0) {
        await tx.delete(assinanteEmpresa).where(inArray(assinanteEmpresa.id, remover));
      }

      for (const v of validados) {
        const { id, ...campos } = v;
        if (id && atuais.some((a) => a.id === id)) {
          await tx
            .update(assinanteEmpresa)
            .set({ ...campos, atualizadoEm: new Date() })
            .where(eq(assinanteEmpresa.id, id));
        } else {
          await tx.insert(assinanteEmpresa).values({ ...campos, codCliente: cod });
        }
      }
    });

    return (await this.listar()).filter((l) => (l.codCliente ?? null) === cod);
  }

  /** Remove o padrão ou uma exceção. Exclusão física: é cadastro de roteamento, não histórico. */
  async remover(id: string): Promise<{ ok: true }> {
    const alvo = await this.db.query.assinanteEmpresa.findFirst({
      where: eq(assinanteEmpresa.id, id),
    });
    if (!alvo) throw new NotFoundException("Assinante não encontrado.");
    await this.db.delete(assinanteEmpresa).where(eq(assinanteEmpresa.id, id));
    return { ok: true };
  }
}
