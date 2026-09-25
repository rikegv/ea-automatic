import { ArgumentsHost, BadRequestException, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { MENSAGEM_TETO_DE_BYTES } from "./leitor";

/**
 * O ERRO DO MULTER VIRANDO 400 COM MENSAGEM, e não 500 com "Internal server error".
 *
 * ┌─ O DEFEITO, medido ────────────────────────────────────────────────────────────────────────────┐
 * │ O `limits.fileSize` do `OPCOES_UPLOAD_PLANILHA` ABORTA a leitura do corpo, que é exatamente o  │
 * │ que se quer: o arquivo absurdo não chega à memória do processo. Só que o multer sinaliza isso  │
 * │ lançando `MulterError("LIMIT_FILE_SIZE")`, e sem ninguém pegar esse erro o Nest o tratava como │
 * │ falha não prevista: HTTP 500. Para quem está na tela, "erro no servidor" é problema do sistema,│
 * │ então a pessoa tenta de novo com o MESMO arquivo, e de novo, em vez de ler que a planilha       │
 * │ passou do limite e dividir o arquivo. A defesa funcionava e a mensagem mentia.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESCOPO DELIBERADAMENTE ESTREITO, e isso é decisão, não esquecimento: o filtro é aplicado com
 * `@UseFilters` NAS ROTAS DE PLANILHA, e não globalmente. As rotas de DOCUMENTO (auditoria, esteira,
 * kit, clicksign) sobem PDF, não têm teto de planilha e não passam por parse síncrono; um filtro
 * global mudaria o comportamento delas de carona, que é o oposto do recorte de escopo (§A.14).
 *
 * O RECONHECIMENTO É POR `name`, e não por `instanceof MulterError`, porque o `multer` não é
 * dependência declarada deste app (ele entra por baixo do `@nestjs/platform-express`, e sob o pnpm
 * não é resolvível por import direto). Depender do símbolo aqui acoplaria a guarda a um pacote que
 * não é nosso; o `name` é parte do contrato do erro e é estável desde sempre.
 *
 * QUALQUER OUTRO ERRO SEGUE O CAMINHO PADRÃO, e é por isso que ele ESTENDE o `BaseExceptionFilter`
 * em vez de relançar: filtro que relança escapa do tratamento do Nest e cai no handler cru do
 * Express, então o 400 legítimo do `exigirPlanilhaNoTeto` e o 404 da vaga inexistente virariam 500.
 * Delegar ao `super.catch` preserva status e mensagem de tudo que não é erro do multer.
 */
@Catch()
export class FiltroUploadPlanilha extends BaseExceptionFilter {
  override catch(erro: unknown, host: ArgumentsHost): void {
    const codigo =
      (erro as { name?: string } | null)?.name === "MulterError"
        ? ((erro as { code?: string }).code ?? "")
        : null;
    // Não é erro do multer: é do próprio serviço (400/404/409 já tratados, ou falha de verdade).
    // Vai para o tratamento padrão do Nest, sem tocar no status nem na mensagem.
    if (codigo === null) {
      super.catch(erro, host);
      return;
    }

    // O TETO é o único caso com mensagem própria, porque é o único que a pessoa resolve sozinha
    // (dividir o arquivo). Os demais (campo inesperado, arquivos demais) são erro de formulário, e a
    // mensagem genérica basta: ninguém os provoca pela tela.
    const mensagem =
      codigo === "LIMIT_FILE_SIZE"
        ? MENSAGEM_TETO_DE_BYTES
        : "Não foi possível receber o arquivo enviado. Envie uma planilha por vez, em .xlsx, .xls ou .csv.";

    // §A.6: a mensagem é CONSTANTE. Sem nome de arquivo, sem tamanho recebido, sem stack: nada do
    // que a pessoa enviou sai daqui, e nada é logado.
    const resposta = host.switchToHttp().getResponse<{
      status: (status: number) => { json: (corpo: unknown) => void };
    }>();
    resposta.status(400).json(new BadRequestException(mensagem).getResponse());
  }
}
