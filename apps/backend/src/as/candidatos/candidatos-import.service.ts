import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  CAMPOS_IMPORT_CANDIDATO,
  isValidCpf,
  normalizeCpf,
  UFS,
  type CenarioImportCandidato,
  type MapaColunasCandidato,
  type PreviaImportCandidato,
  type ResultadoImportCandidato,
  type StatusLinhaImportCandidato,
  type SugestaoColunasCandidato,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { vagas } from "../../db/schema";
import { AiClientService } from "../../ai/ai-client.service";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import {
  assinaturaDaGrade,
  extrairLinhas,
  ErroLeituraPlanilha,
  lerGradeCandidatos,
  amostraParaIa,
  MAX_LINHAS_PLANILHA,
  type GradePlanilha,
} from "./candidatos-import-planilha";

/**
 * IMPORTAÇÃO DE CANDIDATOS POR PLANILHA (Central de Candidatos, A&S).
 *
 * SERVIÇO PRÓPRIO, e não mais um método no `CandidatosService`: aquele arquivo é instanciado por ~14
 * specs com quatro argumentos de construtor, e um quinto (o `AiClientService`) quebraria todas de uma
 * vez (§A.26). Aqui a IA, o catálogo de status da vaga e o próprio `CandidatosService` entram por
 * injeção sem alcançar aquela superfície.
 *
 * ┌─ REUSA OS CAMINHOS DE ESCRITA QUE JÁ EXISTEM, e não abre um segundo ─────────────────────────┐
 * │ A PESSOA nasce por `CandidatosService.criar` (o mesmo do cadastro manual): dedup por CPF,     │
 * │ `criado_por_id` da sessão, `banco_talentos` FORA do alcance, unique parcial do banco. A       │
 * │ VINCULAÇÃO à vaga é `CandidatosService.adicionarEmLote` (o mesmo por trás de                  │
 * │ `POST candidaturas/lote`): nasce na etapa inicial do funil (CAPTACAO), com as travas de vaga  │
 * │ fechada e duplicata por linha. Este serviço NÃO escreve em `as_candidatos` nem em             │
 * │ `as_candidaturas` por conta própria: ele orquestra as portas existentes.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E ELE MOLDA O DESENHO:
 *  - o arquivo é STAGING EFÊMERA: vive só em memória (o Buffer do multipart), NUNCA no banco e nunca
 *    em disco, e é EXPURGADO ao fim (sucesso ou falha) zerando os bytes no `finally`;
 *  - à IA vai só CABEÇALHO + AMOSTRA (até 15 linhas), nunca a planilha inteira;
 *  - NENHUM log (este serviço não tem `Logger`), então CPF, nome e e-mail não têm por onde vazar;
 *  - o relatório por linha carrega o NOME (o diretor pediu, para o time achar a linha), e NUNCA o CPF.
 */
@Injectable()
export class CandidatosImportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly candidatos: CandidatosService,
    private readonly statusVaga: VagaStatusService,
  ) {}

  /** O conjunto das 27 UFs, para descartar em silêncio um valor que não caberia na coluna `uf(2)`. */
  private static readonly UFS_VALIDAS = new Set(UFS.map((u) => u.uf));

  /** Mapa com todas as colunas em `null`: a prévia manual quando a IA não sugere nada. */
  private static mapaVazio(): MapaColunasCandidato {
    return CAMPOS_IMPORT_CANDIDATO.reduce((acc, campo) => {
      acc[campo] = null;
      return acc;
    }, {} as MapaColunasCandidato);
  }

  /**
   * PRÉVIA: lê a planilha, pede o de/para à IA e devolve cabeçalho + amostra + a sugestão. NÃO GRAVA
   * NADA. IA fora do ar ou sem quota devolve a prévia SEM sugestão (mapa vazio), para o time mapear
   * na mão: a IA acelera, não habilita.
   */
  async previa(arquivo: Buffer, aba?: string): Promise<PreviaImportCandidato> {
    try {
      const grade = await this.lerOu400(arquivo, aba);

      const amostra = amostraParaIa(grade);
      const sugestao = await this.sugerirColunas(grade.cabecalho, amostra);

      return {
        cabecalho: grade.cabecalho,
        amostra,
        totalLinhas: grade.linhas.length,
        sugestao,
        // O QUE A LEITURA ENTENDEU, e por isso a prévia devolve: a base real de ERP vem com uma linha
        // de TÍTULO antes do cabeçalho e com mais de uma aba. O time precisa VER qual aba e qual linha
        // foram usadas, e poder trocar, em vez de receber a grade errada sem nenhum aviso.
        abaUsada: grade.abaUsada,
        abasDisponiveis: grade.abasDisponiveis,
        linhaCabecalho: grade.linhaCabecalho,
        // O TETO DECLARADO, e é o que impede a perda silenciosa: `totalLinhas` é o que SERÁ importado,
        // e este campo é o que ficou de fora. Antes, a tela dizia "2.000 linhas na planilha" para um
        // arquivo de 5.000 e o time concluía que tinha entrado tudo. Lojas já fazia assim.
        descartadasPorTeto: grade.descartadasPorTeto,
        // A ASSINATURA DO CABEÇALHO CONFERIDO: o mapa que o time confirma é conferido contra ESTE
        // cabeçalho, e o `aplicar` recalcula a da grade que ele leu. Sem ela, mandar no aplicar uma
        // aba diferente da conferida gravava a COLUNA ERRADA em silêncio. §A.6: é hash de rótulo de
        // coluna e nome de aba, nunca de conteúdo de célula.
        assinaturaCabecalho: assinaturaDaGrade(grade),
      };
    } finally {
      // EXPURGO DA STAGING (§A.6): o Buffer do upload é zerado, dê certo ou não. A grade já foi
      // extraída para strings locais, então zerar os bytes crus não perde nada do processamento.
      arquivo.fill(0);
    }
  }

  /**
   * A LEITURA, com a RECUSA virando 400 e MENSAGEM ACIONÁVEL, nunca 500 e nunca grade de lixo.
   *
   * É o coração do conserto: antes, o que não era xlsx era lido como CSV, e um `.xls` binário virava
   * uma coluna de mojibake que seguia adiante como se estivesse tudo certo. Agora arquivo que não é
   * planilha, planilha vazia, planilha sem cabeçalho e aba inexistente têm cada um a sua mensagem, e
   * a importação PARA ali.
   */
  private async lerOu400(arquivo: Buffer, aba?: string): Promise<GradePlanilha> {
    try {
      return await lerGradeCandidatos(arquivo, { aba });
    } catch (err) {
      if (err instanceof ErroLeituraPlanilha) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** Pergunta o de/para à IA e monta a sugestão; `null` da IA vira mapa vazio com confiança BAIXA. */
  private async sugerirColunas(
    cabecalho: string[],
    amostra: string[][],
  ): Promise<SugestaoColunasCandidato> {
    const daIa = await this.ai.mapearColunasCandidato(cabecalho, amostra);
    if (daIa && daIa.colunaNome !== null) {
      return {
        mapa: {
          nome: daIa.colunaNome,
          cpf: daIa.colunaCpf,
          email: daIa.colunaEmail,
          telefone: daIa.colunaTelefone,
          nascimento: daIa.colunaNascimento,
          cidade: daIa.colunaCidade,
          uf: daIa.colunaUf,
        },
        confianca: daIa.confianca,
        observacao: daIa.observacao,
      };
    }
    return {
      mapa: CandidatosImportService.mapaVazio(),
      confianca: "BAIXA",
      observacao: "A IA não sugeriu o de/para. Mapeie as colunas na mão antes de importar.",
    };
  }

  /**
   * APLICA a importação, com o mapa JÁ CONFIRMADO pelo time. Lê a planilha INTEIRA e processa linha a
   * linha, TOLERANTE A FALHA: uma linha ruim volta no relatório e as demais seguem.
   *
   * AS REGRAS, todas do diretor:
   *  - nome é OBRIGATÓRIO. Linha sem nome é INVALIDO, entra no relatório e não importa.
   *  - CPF válido e JÁ EXISTENTE: REAPROVEITA o candidato (não cria, não sobrescreve).
   *  - CPF válido e novo: cria.
   *  - CPF vazio ou inválido: importa mesmo assim SEM CPF (o nome basta), status SEM_CPF.
   *  - COM_VAGA: os candidatos (novos + reaproveitados) são vinculados à vaga na etapa CAPTACAO,
   *    pela vinculação em lote que já existe.
   */
  async aplicar(
    entrada: {
      arquivo: Buffer;
      cenario: CenarioImportCandidato;
      vagaId?: string;
      mapa: MapaColunasCandidato;
      /** A MESMA aba da prévia. Sem isto, o mapa conferido numa aba seria aplicado na grade de outra. */
      aba?: string;
      /**
       * A ASSINATURA DO CABEÇALHO QUE A PRÉVIA DEVOLVEU, ecoada pela tela. Quando vem, ela é
       * CONFERIDA contra a grade lida aqui, e a divergência recusa a importação.
       *
       * OPCIONAL de propósito, e a decisão é registrada aqui para não virar dúvida depois: cliente
       * que não manda a assinatura (tela antiga ainda carregada no navegador, ou chamada de fora da
       * tela) segue com o comportamento de antes, em vez de a importação quebrar no deploy. A guarda
       * é para quem PODE provar qual cabeçalho conferiu; quem não pode não ganha nada, mas também
       * não perde a função que já usava.
       */
      assinaturaCabecalho?: string;
    },
    autor: AuthUser,
  ): Promise<ResultadoImportCandidato> {
    const { arquivo, cenario, vagaId, mapa, aba, assinaturaCabecalho } = entrada;
    try {
      if (mapa.nome === null) {
        throw new BadRequestException("Aponte a coluna do nome antes de importar.");
      }

      // COM_VAGA: a vaga é conferida UMA VEZ, ANTES de criar ninguém, para não deixar candidato órfão
      // quando a vaga nem recebe gente. A vinculação de verdade (por linha, sob a trava) continua
      // sendo a `adicionarEmLote`, que reconfere a vaga lá dentro.
      if (cenario === "COM_VAGA") {
        if (!vagaId) throw new BadRequestException("Escolha a vaga para vincular os candidatos.");
        await this.exigirVagaQueRecebe(vagaId);
      }

      const grade = await this.lerOu400(arquivo, aba);

      // O CABEÇALHO GRAVADO TEM DE SER O CABEÇALHO CONFERIDO.
      //
      // A conferência do de/para acontece em OUTRA requisição, com outro upload. Sem esta guarda,
      // mandar no aplicar uma `aba` diferente da que a prévia mostrou (ou outro arquivo) fazia o
      // mapa da aba A ser aplicado na grade da aba B: nome no campo de e-mail, telefone no de CPF,
      // e NENHUM erro. A recusa explícita é o oposto disso, e o custo é refazer a conferência.
      if (assinaturaCabecalho && assinaturaCabecalho !== assinaturaDaGrade(grade)) {
        throw new BadRequestException(
          "A planilha ou a aba mudou depois da conferência. Refaça a importação.",
        );
      }

      // PLANILHA ACIMA DO TETO É RECUSADA, e NÃO importada pela metade.
      //
      // A guarda anterior comparava o tamanho da grade JÁ CORTADA pelo leitor com o teto, então ela era
      // CÓDIGO MORTO: nunca disparava, e o resultado era importar 2.000 e descartar o resto em silêncio,
      // com o relatório dizendo que tinha entrado tudo. Agora quem sabe do corte é a leitura
      // (`descartadasPorTeto`), e a mensagem diz o total REAL e o limite, para a pessoa dividir o arquivo.
      if (grade.descartadasPorTeto > 0) {
        const total = grade.linhas.length + grade.descartadasPorTeto;
        throw new BadRequestException(
          `Esta planilha tem ${total} linhas e o limite é de ${MAX_LINHAS_PLANILHA} candidatos por importação. Divida o arquivo e importe em partes.`,
        );
      }

      const linhas = extrairLinhas(grade, mapa);

      const relatorio: ResultadoImportCandidato["linhas"] = [];
      const idsParaVincular: string[] = [];
      let novos = 0;
      let semCpf = 0;
      let duplicadosCpf = 0;
      let invalidos = 0;

      for (const bruta of linhas) {
        const nome = bruta.nome.trim().slice(0, 200);
        if (!nome) {
          invalidos += 1;
          relatorio.push({ linha: bruta.linha, nome: "", status: "INVALIDO", motivo: "Linha sem nome." });
          continue;
        }

        const cpf = this.cpfValidoOuUndefined(bruta.cpf);
        const dto = {
          nome,
          cpf,
          email: this.limitarOuUndefined(bruta.email, 180),
          telefone: this.limitarOuUndefined(bruta.telefone, 40),
          dataNascimento: this.dataOuUndefined(bruta.nascimento),
          cidade: this.limitarOuUndefined(bruta.cidade, 120),
          uf: this.ufOuUndefined(bruta.uf),
          origem: "IMPORTACAO" as const,
        };

        try {
          const ficha = await this.candidatos.criar(dto, autor);
          idsParaVincular.push(ficha.id);
          const status: StatusLinhaImportCandidato = cpf ? "IMPORTADO" : "SEM_CPF";
          if (cpf) novos += 1;
          else semCpf += 1;
          relatorio.push({ linha: bruta.linha, nome, status });
        } catch (err) {
          const reaproveitadoId = this.idDoConflitoDeCpf(err);
          if (reaproveitadoId !== null) {
            // CPF já existe: REAPROVEITA. `criar` lança ANTES de inserir, então nada foi criado nem
            // sobrescrito. O id vem do próprio conflito, para poder vincular à vaga depois.
            duplicadosCpf += 1;
            if (reaproveitadoId) idsParaVincular.push(reaproveitadoId);
            relatorio.push({ linha: bruta.linha, nome, status: "REAPROVEITADO" });
          } else {
            // §A.6: motivo FIXO, nunca `err.message` (pode espelhar dado da linha).
            invalidos += 1;
            relatorio.push({
              linha: bruta.linha,
              nome,
              status: "INVALIDO",
              motivo: "Não foi possível importar esta linha.",
            });
          }
        }
      }

      let vinculados = 0;
      if (cenario === "COM_VAGA" && vagaId && idsParaVincular.length > 0) {
        // DEDUPE antes de vincular: a mesma pessoa reaproveitada duas vezes no arquivo geraria uma
        // falha de "já está na vaga" que é ruído, não resultado.
        const unicos = [...new Set(idsParaVincular)];
        const resultado = await this.candidatos.adicionarEmLote(vagaId, { candidatoIds: unicos }, autor);
        vinculados = resultado.aplicadas;
      }

      const importados = novos + semCpf;
      return {
        contagem: {
          total: linhas.length,
          novos,
          duplicadosCpf,
          semCpf,
          invalidos,
        },
        importados,
        reaproveitados: duplicadosCpf,
        vinculados,
        ignorados: invalidos,
        linhas: relatorio,
      };
    } finally {
      // EXPURGO DA STAGING (§A.6): idêntico ao da prévia, e no `finally` de propósito, para valer
      // TAMBÉM quando uma exceção sobe (vaga inexistente, planilha vazia, teto estourado).
      arquivo.fill(0);
    }
  }

  /** A vaga existe e recebe candidato? A régua vem do catálogo, a mesma que a `alocar` usa. */
  private async exigirVagaQueRecebe(vagaId: string): Promise<void> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    const regua = await this.statusVaga.regua();
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }
  }

  /**
   * O id do candidato já existente quando `criar` recusa por CPF duplicado, ou `null` quando o erro é
   * outro. `conflitoDeCpf` embute o `candidatoId` no corpo do 409; a corrida do unique parcial
   * (`traduzirUnique`) devolve um 409 SEM id, e nesse caso ("já existe", mas sem saber quem)
   * devolvemos a string vazia, que ainda marca REAPROVEITADO sem tentar vincular um id que não temos.
   */
  private idDoConflitoDeCpf(err: unknown): string | null {
    if (!(err instanceof ConflictException)) return null;
    const corpo = err.getResponse();
    if (corpo && typeof corpo === "object" && "candidatoId" in corpo) {
      const id = (corpo as { candidatoId?: unknown }).candidatoId;
      return typeof id === "string" ? id : "";
    }
    return "";
  }

  /** CPF normalizado e VÁLIDO, ou `undefined`. Vazio e inválido caem no mesmo lugar: importa sem CPF. */
  private cpfValidoOuUndefined(bruto: string): string | undefined {
    const cpf = normalizeCpf(bruto ?? "");
    return cpf && isValidCpf(cpf) ? cpf : undefined;
  }

  /** Texto aparado e limitado ao tamanho da coluna, ou `undefined` quando vazio. */
  private limitarOuUndefined(bruto: string, max: number): string | undefined {
    const t = (bruto ?? "").trim();
    return t ? t.slice(0, max) : undefined;
  }

  /** A UF em maiúsculas se for uma das 27, senão `undefined`: valor fora da lista não entra no `uf(2)`. */
  private ufOuUndefined(bruto: string): string | undefined {
    const uf = (bruto ?? "").trim().toUpperCase();
    return CandidatosImportService.UFS_VALIDAS.has(uf) ? uf : undefined;
  }

  /**
   * A data como `YYYY-MM-DD`, ou `undefined` quando não é uma data de calendário válida. Aceita ISO e
   * `DD/MM/AAAA`, e faz round-trip (`Date.UTC`) para recusar 31/02 antes de o Postgres recusar: uma
   * data ruim NÃO pode derrubar a linha inteira, o candidato importa sem o nascimento.
   */
  private dataOuUndefined(bruto: string): string | undefined {
    const t = (bruto ?? "").trim();
    if (!t) return undefined;

    let ano: number, mes: number, dia: number;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
    if (iso) {
      ano = Number(iso[1]);
      mes = Number(iso[2]);
      dia = Number(iso[3]);
    } else if (br) {
      dia = Number(br[1]);
      mes = Number(br[2]);
      ano = Number(br[3]);
      if (br[3].length === 2) ano += ano > 50 ? 1900 : 2000;
    } else {
      return undefined;
    }

    const d = new Date(Date.UTC(ano, mes - 1, dia));
    const valida =
      d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
    if (!valida) return undefined;
    return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
}
