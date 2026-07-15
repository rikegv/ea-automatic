import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { EnviarFormularioDto, IdentificarDto } from "./vt.dto";
import { VtSessaoGuard, type RequestComVt } from "./vt-sessao.guard";
import { VtService } from "./vt.service";

/**
 * Formulário de VT online do candidato (§A.17 etapa 2). Rotas @Public(): quem preenche é o
 * candidato, que NÃO é usuário do sistema e não tem senha (decisão do diretor).
 *
 * A proteção segue o padrão do webhook do Pandapé (§A.5): @Public() só tira o JwtAuthGuard global
 * do caminho; a autorização real é o VtSessaoGuard local, com o token curto emitido no
 * /vt/identificar. O OriginGuard e o throttler globais continuam valendo.
 */
@Controller("vt")
export class VtController {
  constructor(private readonly vt: VtService) {}

  /**
   * Identificação por CPF + data de nascimento (§A.17 Parte A). Sem senha.
   *
   * SEM @Throttle de rota de propósito. O ThrottlerGuard global conta por `req.ip`, e como o
   * browser fala com o Next (que repassa ao backend em loopback), TODOS os candidatos caem no
   * mesmo `127.0.0.1`: um @Throttle aqui não é "por IP", é um balde ÚNICO global. Era exatamente
   * isso que permitia derrubar o formulário inteiro com 10 requisições por minuto.
   *
   * A proteção real vive no service: limite POR CPF (`limitarPorCpf`), que é o alvo do ataque.
   * O limite por IP de verdade tem de ficar na borda, no proxy que enxerga o IP real do candidato.
   */
  @Post("identificar")
  @Public()
  identificar(@Body() dto: IdentificarDto) {
    return this.vt.identificar(dto);
  }

  /** Tarifas vigentes que sugerem o valor de cada condução. Exige sessão do candidato. */
  @Get("tarifas")
  @Public()
  @UseGuards(VtSessaoGuard)
  tarifas() {
    return this.vt.tarifas();
  }

  /**
   * Autocomplete de endereço por CEP (ViaCEP, via backend). Exige sessão do candidato.
   *
   * Também sem @Throttle de rota, pelo mesmo motivo do /identificar: seria um balde único global
   * (30/min para TODOS os candidatos somados), ou seja, mais um jeito de derrubar o formulário.
   * A rota já é fechada pela sessão curta do candidato (VtSessaoGuard).
   */
  @Get("cep/:cep")
  @Public()
  @UseGuards(VtSessaoGuard)
  cep(@Param("cep") cep: string) {
    return this.vt.consultarCep(cep);
  }

  /**
   * Envio do formulário (§A.17 Parte C). A tela só chama depois do aceite dos 3 avisos.
   * A admissão vem do TOKEN, nunca do corpo: o candidato não escolhe para quem envia.
   */
  @Post("formulario")
  @Public()
  @UseGuards(VtSessaoGuard)
  enviar(@Req() req: RequestComVt, @Body() dto: EnviarFormularioDto) {
    return this.vt.enviar(req.vt!.admissaoId, dto);
  }

  /**
   * Documento de VT em PDF (§A.17 Parte D), optante ou recusa conforme o que foi enviado.
   * `?inline=1` abre no navegador do celular; sem o parâmetro, baixa.
   */
  @Get("documento")
  @Public()
  @UseGuards(VtSessaoGuard)
  async documento(
    @Req() req: RequestComVt,
    @Res({ passthrough: true }) res: Response,
    @Query("inline") inline?: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.vt.documento(req.vt!.admissaoId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="formulario-vt.pdf"`,
    });
    return new StreamableFile(buffer);
  }
}
