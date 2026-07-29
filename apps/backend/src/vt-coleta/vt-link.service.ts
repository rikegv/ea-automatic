import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos } from "../db/schema";
import {
  carregarChavePrivadaVt,
  gerarTokenVt,
  VT_LINK_BASE_URL_PADRAO,
  VT_LINK_NAO_CONFIGURADO,
  VT_LINK_TTL_DIAS_PADRAO,
} from "./vt-link-token";

/** Resultado do gerador: o link pronto para o consultor enviar e quando ele expira (ISO). */
export interface LinkVtGerado {
  link: string;
  expiraEm: string;
}

/**
 * Gerador do LINK ASSINADO do formulário de VT (§A.17), lado EA.
 *
 * O consultor dispara pela ficha da admissão; o EA assina um token Ed25519 (chave privada só aqui) e
 * devolve o link do app externo (Firebase), que verifica o token OFFLINE com a chave pública. O EA
 * não é exposto e não é contatado pelo app.
 *
 * INERTE sem `VT_LINK_PRIVATE_KEY`: não lança no boot (o serviço sobe normal); só o endpoint de
 * geração responde 503 com mensagem clara. Mesmo padrão de inércia do resto do módulo de coleta.
 *
 * §A.6: o token carrega CPF e nome (credencial do candidato). NUNCA é logado aqui, e CPF/nome/nascHash
 * também não. Nada de token/CPF em log.
 */
@Injectable()
export class VtLinkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  /** TTL do link em dias (env `VT_LINK_TTL_DIAS`, default 7). Valor inválido cai no padrão. */
  private ttlDias(): number {
    const bruto = Number(this.config.get<string>("VT_LINK_TTL_DIAS"));
    return Number.isFinite(bruto) && bruto > 0 ? bruto : VT_LINK_TTL_DIAS_PADRAO;
  }

  /** URL base do app externo (env `VT_LINK_BASE_URL`, default do app Firebase do VT). */
  private baseUrl(): string {
    return (this.config.get<string>("VT_LINK_BASE_URL") ?? "").trim() || VT_LINK_BASE_URL_PADRAO;
  }

  /**
   * Gera o link assinado para o candidato de uma admissão. Carrega o candidato (nome, cpf, data de
   * nascimento); sem CPF ou sem data de nascimento cadastrados, devolve 422 (não dá para emitir uma
   * credencial que o app não consegue conferir). Sem chave privada configurada, devolve 503.
   */
  async gerarParaAdmissao(admissaoId: string): Promise<LinkVtGerado> {
    const chavePrivada = carregarChavePrivadaVt(this.config.get<string>("VT_LINK_PRIVATE_KEY"));
    if (!chavePrivada) throw new ServiceUnavailableException(VT_LINK_NAO_CONFIGURADO);

    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada.");

    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, admissao.candidatoCpf),
    });
    if (!candidato) throw new NotFoundException("Candidato não encontrado.");

    const cpf = (candidato.cpf ?? "").replace(/\D/g, "");
    const dataNascimento = candidato.dataNascimento?.slice(0, 10) ?? "";
    if (cpf.length !== 11 || !dataNascimento) {
      throw new UnprocessableEntityException(
        "Candidato sem CPF ou data de nascimento cadastrados. Complete o cadastro antes de gerar o link.",
      );
    }

    const ttl = this.ttlDias();
    const agora = new Date();
    const token = gerarTokenVt(
      { admissaoId, nome: candidato.nome, cpf, dataNascimento },
      ttl,
      chavePrivada,
      agora,
    );

    const link = montarLinkVt(this.baseUrl(), token);
    const expiraEm = new Date(agora.getTime() + ttl * 24 * 60 * 60 * 1000).toISOString();
    return { link, expiraEm };
  }
}

/** Monta o link final do VT: `${baseUrl}?t=${token}`. Puro, exposto para teste. */
export function montarLinkVt(baseUrl: string, token: string): string {
  return `${baseUrl}?t=${token}`;
}
