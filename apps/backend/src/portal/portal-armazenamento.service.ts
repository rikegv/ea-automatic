import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LIMITES_PORTAL } from "../domain/portal-credencial";
import type { MetadadoObjeto } from "../domain/portal-chegada";
import { PortalEmissorService, type UrlAssinada } from "./portal-emissor.service";

/**
 * A conversa do EA com o armazenamento do Google, e só ela. Quatro operações, nenhuma delas movendo
 * o arquivo do candidato por dentro da plataforma principal.
 *
 * O MODELO HÍBRIDO: A CHAVE QUE ASSINA SAIU DAQUI. Antes este arquivo carregava DOIS pares de
 * credencial de conta de serviço e montava a assinatura V4 com a chave privada RSA dentro do
 * processo. Agora quem assina é um EMISSOR com identidade de runtime no nosso projeto do Google, e o
 * EA guarda um segredo só, a chave Ed25519 que cunha o BILHETE (`portal-bilhete.ts`). O ganho não é
 * "zero segredo", é rebaixamento de poder: quem roubar a chave do bilhete pede UMA escrita, de UM
 * objeto, com o tipo, o teto de bytes e a trava de sobrescrita que o emissor reimpõe.
 *
 * QUEM ESCOLHE O QUÊ (condição B1). O EA escolhe o MÉTODO, o NOME DO OBJETO e os CABEÇALHOS, e os
 * três viajam dentro do bilhete assinado. A régua continua morando em `domain/portal-credencial.ts`,
 * que é onde ela é provada em teste, e este arquivo NÃO ACRESCENTA, NÃO REMOVE E NÃO REORDENA nenhum
 * cabeçalho, palavra por palavra como antes. O emissor também não pode: ele CONFERE contra a régua
 * dele e RECUSA, e nunca completa em silêncio. Régua duplicada entre a camada pura e a de transporte
 * diverge no primeiro ajuste, e o cabeçalho que cair no vão é justamente o teto de tamanho.
 *
 * DUAS IDENTIDADES DO OUTRO LADO, SEPARADAS DE PROPÓSITO (condições B2 e B3). O assinador só CRIA
 * objeto: não lê, não lista, não apaga. A curadoria consulta metadado, corrige tipo e APAGA. Juntar
 * as duas faria a identidade que assina a credencial do candidato carregar, por tabela, o poder de
 * apagar o balde inteiro, que é o padrão de dano da §A.33. A separação é de IAM, do diretor, e este
 * código não presume que a identidade que assina possa ler, listar ou apagar: o apagar vai por outro
 * destino, que é outra rota e outra identidade.
 *
 * NASCE INERTE. Sem `PORTAL_GCS_BUCKET`, sem `PORTAL_EMISSOR_URL` ou sem a chave do bilhete, nada
 * aqui sobe exceção no boot: o serviço responde "não configurado" e as rotas se recusam a emitir, no
 * mesmo molde do webhook do Pandapé (§A.5), que nasce fechado e sem hardcode.
 *
 * O BALDE AUTORITATIVO PASSA A SER O DO EMISSOR. `PORTAL_GCS_BUCKET` deixa de ser "o balde para o
 * qual assinamos" e vira "o nome que mandamos ao emissor e ao leitor, mais o interruptor de inércia".
 * Apontar esta variável para outro lugar NÃO faz o EA escrever em outro lugar: faz o emissor recusar.
 * É rebaixamento de poder de uma variável de ambiente, e é bom que seja.
 *
 * §A.6: a URL assinada É uma credencial. Ela não é persistida, não é logada e não volta em mensagem
 * de erro. O nome do objeto também não vai para log inteiro. O que fica no banco é o caminho do
 * objeto, que é opaco.
 */
@Injectable()
export class PortalArmazenamentoService {
  private readonly log = new Logger(PortalArmazenamentoService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emissor: PortalEmissorService,
  ) {}

  private get bucket(): string {
    return (this.config.get<string>("PORTAL_GCS_BUCKET") ?? "").trim();
  }

  /** O balde, para quem precisa nomeá-lo no pedido ao leitor. Vazio quando não configurado. */
  nomeDoBucket(): string {
    return this.bucket;
  }

  /**
   * Prazo ABSOLUTO da credencial, em epoch de segundos (condição B4).
   *
   * É o MESMO prazo de hoje, os dez minutos de `LIMITES_PORTAL.TTL_MS`, e NÃO o da sessão do
   * candidato. O motivo é o achado da auditoria: com o emissor sem estado, quem guardou um bilhete
   * pode pedir uma URL nova depois de a primeira expirar, então o prazo efetivo da credencial deixa
   * de ser o da URL e passa a ser o do bilhete. Uso único de verdade é impossível sem estado, e é
   * honesto dizer isso: o que se compra é um TETO DE TEMPO CURTO, não uso único. Com dez minutos e
   * a cota já debitada na emissão, o resíduo é aceitável.
   *
   * O INSTANTE VEM DA CREDENCIAL GRAVADA, e não de um segundo relógio. `expiraEmMs` é o
   * `expiraEm` que a linha de `portal_credenciais` guardou, calculado uma vez na régua pura. Ler o
   * relógio de novo aqui produziria uma deriva entre o prazo que está no banco e o prazo que viaja
   * no bilhete, pequena e sem alarme nenhum. O relógio só entra quando o chamador não tem a
   * credencial em mãos, e mesmo então o teto de `portal-bilhete.ts` segura o caso geral.
   */
  private absDaCredencial(expiraEmMs?: number): number {
    const instante =
      typeof expiraEmMs === "number" && Number.isFinite(expiraEmMs) && expiraEmMs > 0
        ? expiraEmMs
        : Date.now() + LIMITES_PORTAL.TTL_MS;
    return Math.floor(instante / 1000);
  }

  /** Prazo absoluto das operações internas de curadoria, que acontecem no ciclo e somem. */
  private absCurto(): number {
    return Math.floor(Date.now() / 1000) + 60;
  }

  /** O portal só emite credencial quando o balde e o emissor existem. */
  podeEmitir(): boolean {
    return this.bucket.length > 0 && this.emissor.configurado();
  }

  /**
   * A confirmação do lado do servidor passa pelo mesmo emissor, por outro DESTINO. As identidades
   * são separadas do lado de lá, não aqui: o que este código garante é que o pedido de curadoria
   * nunca viaja com o destino de escrita.
   */
  podeConfirmar(): boolean {
    return this.bucket.length > 0 && this.emissor.configurado();
  }

  /**
   * Assina a credencial de escrita de UM objeto.
   *
   * OS CABEÇALHOS ASSINADOS NÃO SÃO ESCOLHIDOS AQUI: eles vêm prontos de
   * `domain/portal-credencial.ts`, que é onde a régua mora e onde ela é provada em teste. Este
   * método não acrescenta, não remove e não reordena nenhum deles, e a passagem direta é
   * deliberada. Eles entram no BILHETE assinado, e o emissor confere e recusa; a única coisa que ele
   * monta é o que depende da identidade dele e que nós não temos como saber, que é a credencial de
   * assinatura, a data e a região.
   *
   * O método é PUT e mais nada. Nada de GET, nada de LIST, nada de DELETE por esta porta.
   *
   * VIROU ASSÍNCRONO, e não havia como não virar: assinar deixou de ser uma conta local e passou a
   * ser uma conversa de rede. O nome, os parâmetros e o significado do nulo continuam os mesmos.
   */
  async assinarEscrita(
    objeto: string,
    cabecalhosAssinados: Record<string, string>,
    expiraEmMs?: number,
  ): Promise<UrlAssinada | null> {
    if (!this.bucket) return null;

    return this.emissor.assinarEscrita({
      destino: "assinar-escrita",
      bucket: this.bucket,
      objeto,
      metodo: "PUT",
      cabecalhos: cabecalhosAssinados,
      ttlSegundos: Math.floor(LIMITES_PORTAL.TTL_MS / 1000),
      absEpoch: this.absDaCredencial(expiraEmMs),
    });
  }

  /**
   * Consulta o METADADO do objeto, que é como o EA sabe que o arquivo chegou.
   *
   * É um HEAD, e quem o executa é a CURADORIA, com a identidade dela: existe, quantos bytes, qual
   * tipo. NENHUM byte do arquivo é baixado, nem por nós nem pelo emissor, que nunca abre o arquivo
   * (VS7). A independência continua cumprida porque quem confirma não é o leitor: é outro serviço,
   * com outra identidade. A palavra do navegador não entra nesta conta em momento nenhum.
   *
   * Falha de rede devolve `null`, e isso é deliberado: o comportamento seguro é ABSTER-SE, o
   * documento continua pendente e a próxima tentativa confirma. Marcar como entregue na dúvida é o
   * dano irreversível e silencioso da §A.33 em outra roupa.
   */
  async consultarMetadado(objeto: string): Promise<MetadadoObjeto | null> {
    if (!this.bucket) return null;

    const resposta = await this.emissor.consultarMetadado({
      destino: "metadado",
      bucket: this.bucket,
      objeto,
      metodo: "HEAD",
      cabecalhos: {},
      ttlSegundos: 60,
      absEpoch: this.absCurto(),
    });
    if (!resposta || resposta.existe === false) return null;

    const bytes = Number(resposta.bytes ?? 0);
    const geracao = Number(resposta.geracao ?? 0);
    return {
      // O ECO, e não o nosso próprio `objeto`. A conferência de objeto divergente em
      // `domain/portal-chegada.ts` só tem valor se o nome vier do OUTRO LADO: montada com o nosso
      // argumento ela nunca pode falhar. O eco já foi conferido contra o pedido em
      // `PortalEmissorService.consultarMetadado`, que recusa quando falta ou difere, então o que
      // chega aqui é o nome que o armazenamento devolveu.
      objeto: resposta.objeto as string,
      bytes: Number.isFinite(bytes) ? bytes : 0,
      contentType: (resposta.contentType ?? "").trim(),
      geracao: Number.isFinite(geracao) && geracao > 0 ? geracao : null,
    };
  }

  /**
   * EXIGÊNCIA 10: o tipo de conteúdo corrigido POR NÓS depois da leitura.
   *
   * O tipo que o objeto carrega é o que o cliente declarou na hora de subir, e cliente engana: o
   * iPhone manda HEIC dizendo que é JPEG, o navegador manda `octet-stream` quando não sabe. Quem
   * descobriu o tipo de verdade foi a leitura, pelos magic bytes (a mesma régua de
   * `pandape/mime-documento`), e o objeto precisa passar a dizer a verdade, senão quem abrir o
   * prontuário meses depois recebe um arquivo que o navegador não sabe exibir.
   *
   * A forma continua sendo uma CÓPIA SOBRE SI MESMO com `x-goog-metadata-directive: REPLACE`, e os
   * cabeçalhos continuam sendo escolhidos AQUI, do lado do EA, e viajam dentro do bilhete. Roda com
   * a identidade de CURADORIA, nunca com a que assina a credencial do candidato.
   */
  async corrigirContentType(objeto: string, tipoReal: string): Promise<boolean> {
    if (!this.bucket) return false;

    return this.emissor.corrigirTipo({
      destino: "corrigir-tipo",
      bucket: this.bucket,
      objeto,
      metodo: "PUT",
      cabecalhos: {
        "content-type": tipoReal,
        "x-goog-copy-source": `${this.bucket}/${objeto}`,
        "x-goog-metadata-directive": "REPLACE",
      },
      ttlSegundos: 60,
      absEpoch: this.absCurto(),
    });
  }

  /**
   * APAGAR O OBJETO RECUSADO (exigência 7). AGORA ELE APAGA DE VERDADE.
   *
   * A lacuna registrada antes deixou de existir com o balde no nosso projeto: a permissão de remoção
   * é concedida por nós, à identidade de CURADORIA, e só neste balde. O EA não ganha permissão de
   * apagar, ele ganha o direito de PEDIR, com bilhete assinado e destino próprio. Bilhete de escrita
   * não serve para apagar, porque o destino entra na assinatura (condição B3).
   *
   * CONDIÇÃO B6, E ELA É DE ACEITAÇÃO: este método NUNCA assume que o objeto existe e NUNCA lança.
   * Falso significa "não apagou", seja porque o objeto não estava lá, seja porque o emissor está
   * fora do ar, seja porque a permissão não foi concedida ainda. Quem chama decide o que fazer com o
   * falso, e o caminho do arquivo já decidiu: registra o evento e segue, sem derrubar nada. A rede de
   * proteção do ciclo de vida do balde pega o que ficou para trás.
   *
   * §A.6: só o PREFIXO do objeto vai ao log, o suficiente para achar a pasta numa varredura manual,
   * nunca o envio exato.
   */
  async apagarObjeto(objeto: string): Promise<boolean> {
    if (!this.bucket) return false;

    try {
      const apagado = await this.emissor.apagar({
        destino: "apagar",
        bucket: this.bucket,
        objeto,
        metodo: "DELETE",
        cabecalhos: {},
        ttlSegundos: 60,
        absEpoch: this.absCurto(),
      });
      if (!apagado) {
        this.log.error(
          `objeto recusado permaneceu no armazenamento: ${objeto.split("/")[0]}`,
        );
      }
      return apagado;
    } catch (erro) {
      this.log.error(`falha ao apagar objeto no armazenamento: ${(erro as Error).name}`);
      return false;
    }
  }

  /** Só para diagnóstico: diz se o portal tem para onde falar, sem revelar endereço nem chave. */
  descrever(): { bucket: string; emissor: boolean; emiteEscrita: boolean; confirmaLeitura: boolean } {
    return {
      bucket: this.bucket,
      emissor: this.emissor.configurado(),
      emiteEscrita: this.podeEmitir(),
      confirmaLeitura: this.podeConfirmar(),
    };
  }
}
