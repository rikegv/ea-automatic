import { createHash } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerStorage } from "@nestjs/throttler";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { AiClientService, type ConducaoVtPayload } from "../ai/ai-client.service";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  formularioVtConducoes,
  formulariosVt,
  tarifasTransporte,
} from "../db/schema";
import type { EnviarFormularioDto, IdentificarDto } from "./vt.dto";

/** Faróis que encerram a admissão: quem declinou não preenche VT (§A.16). */
const FAROIS_ENCERRADOS = ["DECLINOU", "RESCISAO"] as const;

/** Vida curta da sessão do candidato: tempo de preencher o formulário, não mais que isso. */
const SESSAO_TTL = "30m";

/**
 * Limite de tentativas de identificação POR CPF (não por IP).
 *
 * Por que por CPF e não por IP: o backend NÃO tem como saber o IP do candidato. O browser fala com
 * o Next, que repassa por http-proxy SEM `xfwd`, então o backend vê sempre `127.0.0.1` no socket e
 * o único `x-forwarded-for` que chega é o que o CLIENTE mandar (verificado empiricamente: cliente
 * normal chega com XFF nulo; cliente que forja o header chega com o valor forjado intacto). Ligar
 * `trust proxy` aqui daria ao atacante tentativas ILIMITADAS (é só rotacionar o header) e ainda
 * manteria os candidatos legítimos num balde único. Rate-limit por IP só é possível na borda (o
 * proxy que enxerga o IP real), quando a exposição pública for decidida.
 *
 * O CPF é exatamente o alvo que precisa ser protegido: o ataque real é varrer datas de nascimento
 * de UM CPF conhecido. Este limite corta isso na raiz e, por ser por CPF, um atacante não derruba
 * o acesso dos demais candidatos.
 */
const CPF_LIMITE = 10; // tentativas por janela
const CPF_JANELA_MS = 15 * 60_000;
const CPF_BLOQUEIO_MS = 15 * 60_000;

export interface CepResolvido {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Formulário de VT online (§A.17 etapa 2), lado do candidato.
 *
 * §A.6: CPF e data de nascimento são CREDENCIAL. Não são logados em nenhuma hipótese, não voltam
 * na resposta e não entram no token de sessão. Falha de identificação devolve sempre a MESMA
 * mensagem, sem distinguir "CPF não existe" de "data não confere", para não transformar a rota
 * num oráculo de CPF válido.
 */
@Injectable()
export class VtService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly ai: AiClientService,
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
  ) {}

  /**
   * Chave de contagem por CPF. §A.6: o CPF NUNCA é usado cru como chave (ela vive no armazenamento
   * do throttler); guardamos um hash com pepper, que serve para contar e não revela o CPF.
   */
  private chaveCpf(cpf: string): string {
    const pepper = this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
    return `vt-cpf:${createHash("sha256").update(`${pepper}:${cpf}`).digest("hex").slice(0, 32)}`;
  }

  /** Bloqueia a varredura de datas de nascimento de um mesmo CPF. Não afeta os demais CPFs. */
  private async limitarPorCpf(cpf: string): Promise<void> {
    const r = await this.throttle.increment(
      this.chaveCpf(cpf),
      CPF_JANELA_MS,
      CPF_LIMITE,
      CPF_BLOQUEIO_MS,
      "vt-cpf",
    );
    if (r.isBlocked) {
      throw new HttpException(
        "Muitas tentativas para este CPF. Aguarde alguns minutos e tente de novo.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Confere CPF + data de nascimento contra a base de admissões vivas e abre a sessão.
   * Retorna só o nome (para a tela cumprimentar o candidato) e o token da sessão.
   */
  async identificar(dto: IdentificarDto) {
    // Antes de qualquer consulta: corta a varredura de datas deste CPF.
    await this.limitarPorCpf(dto.cpf);

    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, dto.cpf),
    });

    // Mensagem única para todos os casos de não-casamento (candidato inexistente, sem data de
    // nascimento cadastrada, data divergente ou sem admissão viva). Ver comentário da classe.
    const naoEncontrado = () =>
      new UnauthorizedException(
        "Dados não encontrados. Confira o CPF e a data de nascimento, ou procure o RH.",
      );

    if (!candidato?.dataNascimento) throw naoEncontrado();
    // `date` do Postgres volta como "yyyy-mm-dd"; o formulário envia o mesmo formato.
    if (candidato.dataNascimento !== dto.dataNascimento.slice(0, 10)) throw naoEncontrado();

    // Admissão viva mais recente. O caso de 2 admissões vivas para o mesmo CPF é raro (1 na base
    // hoje); resolvemos pela mais recente em vez de pedir escolha ao candidato.
    const admissao = await this.db.query.admissoes.findFirst({
      where: and(
        eq(admissoes.candidatoCpf, candidato.cpf),
        notInArray(admissoes.farolGlobal, [...FAROIS_ENCERRADOS]),
      ),
      orderBy: [desc(admissoes.criadoEm)],
    });
    if (!admissao) throw naoEncontrado();

    const token = await this.jwt.signAsync(
      { sub: admissao.id, typ: "vt" },
      { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: SESSAO_TTL },
    );

    return { token, nome: candidato.nome };
  }

  /** Tarifas ativas que alimentam a sugestão de valor por (cidade + tipo de transporte). */
  async tarifas() {
    const rows = await this.db
      .select({
        cidade: tarifasTransporte.cidade,
        tipoTransporte: tarifasTransporte.tipoTransporte,
        valor: tarifasTransporte.valor,
      })
      .from(tarifasTransporte)
      .where(eq(tarifasTransporte.ativo, true))
      .orderBy(asc(tarifasTransporte.cidade), asc(tarifasTransporte.tipoTransporte));
    return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
  }

  /**
   * Consulta de CEP (ViaCEP). O proxy é no BACKEND de propósito: mantém a dependência externa
   * server-side (§A.5, integração desacoplada) e funciona mesmo se o celular do candidato não
   * tiver internet direta, só acesso ao EA. Só o CEP sai daqui, nenhum dado do candidato.
   */
  async consultarCep(cepBruto: string): Promise<CepResolvido> {
    const cep = (cepBruto ?? "").replace(/\D/g, "");
    if (cep.length !== 8) throw new NotFoundException("CEP inválido. Informe os 8 dígitos.");

    let dados: Record<string, unknown>;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      dados = (await resp.json()) as Record<string, unknown>;
    } catch {
      // Indisponibilidade do ViaCEP não pode travar o formulário: a tela deixa preencher à mão.
      throw new ServiceUnavailableException(
        "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
      );
    }

    if (dados.erro) throw new NotFoundException("CEP não encontrado. Confira o número digitado.");

    return {
      cep,
      logradouro: String(dados.logradouro ?? ""),
      bairro: String(dados.bairro ?? ""),
      cidade: String(dados.localidade ?? ""),
      uf: String(dados.uf ?? ""),
    };
  }

  /**
   * Envio do formulário (§A.17 Parte C). Chamado só depois do aceite dos 3 avisos na tela; o
   * `ciente_em` grava QUANDO o candidato declarou ciência, como trilha de responsabilização.
   *
   * UM formulário por admissão: reenviar SOBRESCREVE o anterior (o kit compõe um documento só).
   * Tudo numa transação, para nunca sobrar formulário sem condução ou vice-versa.
   */
  async enviar(admissaoId: string, dto: EnviarFormularioDto) {
    // Não-optante não descreve itinerário: as conduções são descartadas mesmo se vierem.
    const conducoes = dto.optante ? dto.conducoes : [];

    if (dto.optante && conducoes.length === 0) {
      throw new BadRequestException(
        "Informe pelo menos uma condução para quem opta pelo vale-transporte.",
      );
    }
    // Regra composta do cartão: OUTRO exige o nome (decisão do diretor).
    for (const c of conducoes) {
      if (c.cartao === "OUTRO" && !c.cartaoOutro?.trim()) {
        throw new BadRequestException("Informe qual é o cartão quando escolher a opção Outro.");
      }
    }

    // TOTAIS calculados AQUI, nunca aceitos do cliente: é o valor que vai ao documento assinado.
    const somaDe = (sentido: "IDA" | "VOLTA") =>
      conducoes.filter((c) => c.sentido === sentido).reduce((s, c) => s + c.valor, 0);
    const totalIda = somaDe("IDA");
    const totalVolta = somaDe("VOLTA");

    return this.db.transaction(async (tx) => {
      await tx.delete(formulariosVt).where(eq(formulariosVt.admissaoId, admissaoId));
      const [form] = await tx
        .insert(formulariosVt)
        .values({
          admissaoId,
          optante: dto.optante,
          cep: dto.cep,
          logradouro: dto.logradouro.trim(),
          numero: dto.numero.trim(),
          complemento: dto.complemento?.trim() ? dto.complemento.trim() : null,
          bairro: dto.bairro.trim(),
          cidade: dto.cidade.trim(),
          uf: dto.uf.toUpperCase(),
          totalIda: totalIda.toFixed(2),
          totalVolta: totalVolta.toFixed(2),
          totalDia: (totalIda + totalVolta).toFixed(2),
          cienteEm: new Date(),
        })
        .returning();

      if (conducoes.length > 0) {
        await tx.insert(formularioVtConducoes).values(
          conducoes.map((c, i) => ({
            formularioId: form.id,
            sentido: c.sentido,
            ordem: i,
            cidade: c.cidade.trim(),
            tipoTransporte: c.tipoTransporte.trim(),
            cartao: c.cartao,
            cartaoOutro: c.cartao === "OUTRO" ? (c.cartaoOutro?.trim() ?? null) : null,
            valor: c.valor.toFixed(2),
          })),
        );
      }
      return { ok: true, optante: form.optante, totalDia: Number(form.totalDia) };
    });
  }

  /**
   * Documento de VT em PDF (§A.17 Parte D): OPTANTE (itinerário + compromisso) ou NÃO-OPTANTE
   * (recusa). Composto pelo ai-service (reportlab) a partir do que foi enviado; o binário só
   * trafega, não é gravado (§A.6, coerente com "documento é efêmero").
   */
  async documento(admissaoId: string) {
    const form = await this.db.query.formulariosVt.findFirst({
      where: eq(formulariosVt.admissaoId, admissaoId),
    });
    if (!form) throw new NotFoundException("Formulário de VT ainda não foi enviado.");

    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    const candidato = admissao
      ? await this.db.query.candidatos.findFirst({ where: eq(candidatos.cpf, admissao.candidatoCpf) })
      : undefined;
    if (!candidato) throw new NotFoundException("Candidato não encontrado.");

    const linhas = await this.db
      .select()
      .from(formularioVtConducoes)
      .where(eq(formularioVtConducoes.formularioId, form.id))
      .orderBy(asc(formularioVtConducoes.ordem));

    const rotuloCartao = (c: (typeof linhas)[number]) =>
      c.cartao === "BILHETE_UNICO"
        ? "Bilhete Único"
        : c.cartao === "CARTAO_TOP"
          ? "Cartão TOP"
          : (c.cartaoOutro ?? "Outro");

    const conducoes: ConducaoVtPayload[] = linhas.map((c) => ({
      sentido: c.sentido,
      // Coluna "Meio de transporte" = tipo + cidade (decisão do diretor).
      meioTransporte: `${c.tipoTransporte} - ${c.cidade}`,
      cartao: rotuloCartao(c),
      valor: Number(c.valor),
    }));

    const endereco = [
      `${form.logradouro}, ${form.numero}`,
      form.complemento,
      form.bairro,
      `CEP ${form.cep.slice(0, 5)}-${form.cep.slice(5)}`,
    ]
      .filter(Boolean)
      .join(" - ");

    return this.ai.gerarDocumentoVt({
      tipo: form.optante ? "OPTANTE" : "NAO_OPTANTE",
      nome: candidato.nome,
      cpf: candidato.cpf,
      dataNascimento: candidato.dataNascimento ?? null,
      endereco,
      cidadeUf: `${form.cidade}/${form.uf}`,
      conducoes,
      totalIda: Number(form.totalIda),
      totalVolta: Number(form.totalVolta),
      totalDia: Number(form.totalDia),
    });
  }
}
