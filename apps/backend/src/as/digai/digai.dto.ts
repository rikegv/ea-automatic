import {
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  type ValidationOptions,
} from "class-validator";
import { ehIdTecnicoDigai } from "./digai-grade";

/**
 * ─ OS CORPOS DAS ROTAS DO DIGAI ────────────────────────────────────────────────────────────────
 *
 * ┌─ A REGUA E A MESMA DOS OUTROS DOIS PONTOS, E E LITERALMENTE A MESMA FUNCAO ──────────────────┐
 * │ O identificador e conferido em tres superficies, e cada uma protege uma coisa diferente: o    │
 * │ DTO protege a ROTA (o 400 sai antes de o valor tocar qualquer coisa), o dominio protege a     │
 * │ FILA e o LOG (`identificadoresDoEvento`), e a grade protege a URL (`autorizar`). Validar so   │
 * │ num lugar deixa os outros dois sem dono, e o valor viaja para todos eles.                     │
 * │                                                                                               │
 * │ ELAS CHAMAM `ehIdTecnicoDigai`, E NAO TRES REGEX PARECIDAS. Foi essa a correcao do VETO 2 da  │
 * │ auditoria de codigo (29/09): o DTO cobrava SO o alfabeto `[A-Za-z0-9._-]{1,64}`, e ONZE       │
 * │ DIGITOS CABEM INTEIROS NELE. Um documento colado no campo virava a chave `digai-<documento>`  │
 * │ no Redis e o valor do payload do job, por 24h a 48h, FORA do alcance de um expurgo que so     │
 * │ conhece Postgres. A grade continha o dano (a chamada nunca sairia), mas a escrita no Redis ja │
 * │ tinha acontecido. `ehIdTecnicoDigai` e o alfabeto MAIS `pareceDocumentoOuTelefone`, e agora e │
 * │ ela, e so ela, que responde nas tres portas.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum corpo daqui carrega dado pessoal. Consulta por documento, e-mail ou telefone esta
 * BARRADA na grade, e um DTO que a aceitasse seria a porta para ela voltar, foi o que aconteceu.
 */

/**
 * A MESMA REGUA DA GRADE, EMBRULHADA PARA O `class-validator`.
 *
 * Decorador proprio, e nao um `@Matches` com a regex redigitada, porque regex copiada diverge no
 * primeiro ajuste e a que ficasse para tras seria justamente a que decide se um documento entra no
 * Redis. A mensagem de recusa NAO repete o valor recusado: se o valor for um documento, ecoa-lo na
 * resposta de 400 publicaria exatamente o que a regra existe para barrar.
 */
function EhIdTecnicoDoDigai(opcoes?: ValidationOptions) {
  return function (alvo: object, propriedade: string): void {
    registerDecorator({
      name: "ehIdTecnicoDoDigai",
      target: alvo.constructor,
      propertyName: propriedade,
      options: opcoes,
      validator: {
        validate: (valor: unknown) => ehIdTecnicoDigai(valor),
        defaultMessage: () => RECUSA,
      },
    });
  };
}

const RECUSA = "identificador fora do formato tecnico aceito";

/**
 * O REPROCESSAMENTO MANUAL DE UM EVENTO, pela tela de administracao.
 *
 * Existe porque o Digai entrega o evento UMA VEZ: se a fila estava fora do ar naquele minuto, nao
 * ha reentrega automatica, e sem esta porta a pessoa se perde em silencio. A operacao e idempotente
 * pela mesma chave da fila, entao reprocessar duas vezes nao cria duas pessoas.
 */
export class ReprocessarEventoDigaiDto {
  @IsString()
  @MaxLength(64)
  @EhIdTecnicoDoDigai({ message: RECUSA })
  screeningId!: string;

  @IsString()
  @MaxLength(64)
  @EhIdTecnicoDoDigai({ message: RECUSA })
  userId!: string;

  /** Opcional: o evento nem sempre o traz, e a segunda chamada se resolve sem ele. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @EhIdTecnicoDoDigai({ message: RECUSA })
  attemptId?: string;
}
