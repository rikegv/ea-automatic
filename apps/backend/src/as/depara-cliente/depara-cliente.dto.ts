import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * ─ A FRONTEIRA HTTP DO DE/PARA DE CLIENTE ──────────────────────────────────────────────────────
 *
 * ┌─ `forbidNonWhitelisted` É GLOBAL, E ESTE ARQUIVO DEPENDE DISSO ───────────────────────────────┐
 * │ O `ValidationPipe` do `main.ts` roda com `whitelist` e `forbidNonWhitelisted`, então campo que │
 * │ não está declarado aqui NÃO chega ao serviço: ele é 400. É isso que impede o corpo de carregar │
 * │ `confirmadoPorId` e a autoria virar campo de formulário, que é a régua do `adotarAts`.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO EXISTE DTO PARA CRIAR TRADUÇÃO À MÃO, e a ausência é deliberada: quem cria linha é a
 * SINCRONIZAÇÃO, a partir da planilha. Uma porta de criação manual seria um segundo escritor do
 * catálogo, com código de vaga digitado, e a primeira coisa que alguém digitaria errado é a chave.
 *
 * §A.6: nada de pessoal atravessa aqui. Código de cliente do catálogo e um booleano.
 */

export class ConfirmarDeParaClienteDto {
  /**
   * O CÓDIGO DO CLIENTE DO CATÁLOGO, e ele é a decisão que esta rota registra.
   *
   * O AUTOR NÃO ESTÁ AQUI, E NÃO PODE ESTAR: ele vem da SESSÃO. Autoria é trilha, não campo de
   * formulário, e vinda do corpo qualquer chamada direta assinaria a confirmação com o id de outra
   * pessoa, deixando sem resposta a única pergunta que importa no dia em que a linha estiver errada.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;
}

export class AlternarAtivoDeParaClienteDto {
  /** `false` é "pare de confiar nesta tradução"; `true` é o gesto de volta, e ele é HUMANO. */
  @IsBoolean()
  ativo!: boolean;
}

export class FiltroDeParaClienteDto {
  /**
   * O PADRÃO É A FILA (o que falta confirmar), porque é isso que a tela existe para resolver.
   *
   * TEXTO, E NÃO BOOLEANO, de propósito: isto é `query string`, onde tudo chega como texto, e um
   * `@IsBoolean` aqui recusaria `?apenasPendentes=false` com 400. A conversão é do serviço, e o
   * valor diferente de `"false"` cai para o lado do PADRÃO, que é mostrar menos.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  apenasPendentes?: string;
}
