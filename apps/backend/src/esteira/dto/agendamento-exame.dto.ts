import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
  Min,
  MinLength,
} from "class-validator";
// ValidarAsoDto removido: a validação do ASO é feita pela I.A na leitura do documento (não manual).

// A constante `FORNECEDORES_EXAME` (lista fixa MEDICAL/LIMER) SAIU com o enum: fornecedor agora é
// cadastrado na clínica e derivado dela, sem lista fechada no código.

/**
 * Dados que o consultor lança no modal de Gestão de Agendamento do Exame (aba EXAME). A clínica/
 * fornecedor responde por e-mail e o consultor registra aqui. Todos obrigatórios: cadastro completo.
 */
/**
 * UM endereço do exame: a clínica escolhida no catálogo, o endereço e o horário PRÓPRIO dele.
 *
 * A clínica vem por ID (nunca texto livre, OST das clínicas): o backend resolve o nome e grava junto,
 * para o histórico continuar legível se a clínica for inativada depois.
 */
export class EnderecoExameDto {
  @IsUUID()
  clinicaId!: string;

  @IsString()
  @MinLength(1)
  local!: string;

  @Matches(/^\d{2}:\d{2}$/, { message: "O horário deve estar no formato HH:MM." })
  horario!: string;
}

export class AgendamentoExameDto {
  @IsDateString()
  data!: string; // ISO YYYY-MM-DD


  /**
   * ENDEREÇOS do exame (OST Onda 2, multi-endereço). UM ou MAIS: o candidato pode fazer o exame em
   * três lugares no mesmo dia, cada um com HORÁRIO próprio.
   *
   * A DATA não está aqui: ela é ÚNICA do agendamento (campo `data` acima). A tela pré-preenche a
   * mesma data em todos os endereços e deixa editar, mas o dia é um só.
   *
   * O teto de 10 é folga larga sobre o caso real (três) e existe para um payload absurdo não virar
   * dez mil linhas filhas.
   */
  @IsArray()
  @ArrayMinSize(1, { message: "Informe ao menos um endereço para o exame." })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EnderecoExameDto)
  enderecos!: EnderecoExameDto[];

  // FORNECEDOR SAIU DAQUI (OST do fornecedor por clínica): ele é atributo da CLÍNICA e passou a ser
  // DERIVADO, por endereço, da clínica escolhida. A tela não pergunta mais, e o payload não o traz:
  // aceitar um fornecedor do cliente permitiria contradizer o cadastro da clínica.

  // Valor do exame (novo — decisão do diretor). Opcional: o time preenche quando souber. Aceita
  // "500,00" e "500.00" (front pt-BR), mesma regra dos benefícios. Zero é válido (gratuito).
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" && value.trim() !== ""
      ? Number(value.replace(/\./g, "").replace(",", "."))
      : value === "" || value === null
        ? undefined
        : value,
  )
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Valor do exame inválido. Use o formato 500,00." })
  @Min(0, { message: "O valor do exame não pode ser negativo." })
  valor?: number;

  /**
   * Previsão de quando o ASO fica pronto, informada pela clínica. ISO YYYY-MM-DD.
   *
   * AGORA É OBRIGATÓRIA (OST Onda 2). Isto REVERTE a decisão anterior, que a deixava opcional com o
   * argumento de que "a previsão quem informa é a clínica, e pode não ter respondido no momento do
   * agendamento". A decisão nova do diretor prevalece, e tem razão de ser: é esta data que o
   * verificador de hora em hora compara com a data do exame para decidir entre "Aguardando Liberação
   * Do ASO" e "ASO Pendente". Sem ela, o status automático não teria como existir.
   */
  @IsDateString({}, { message: "A previsão do ASO informada é inválida." })
  previsaoAso!: string;

  /** true quando é REAGENDAMENTO (já existe agendamento) — incrementa o contador. */
  @IsOptional()
  @IsBoolean()
  reagendar?: boolean;
}
