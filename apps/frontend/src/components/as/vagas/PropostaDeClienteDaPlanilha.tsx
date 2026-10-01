"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  conferenciaDaProposta,
  rotuloDaOrigem,
  rotuloDoEstado,
  type ConferenciaDaProposta,
} from "@/lib/as-proposta-cliente";
import type { PropostaDeClienteDaVaga } from "@ea/shared-types";

/**
 * ─ A PROPOSTA DE CLIENTE, LOGO ABAIXO DO SELETOR, MARCADA COMO PROPOSTA ────────────────────────
 *
 * A fábrica lê a planilha viva do time e PROPÕE o cliente. Esta caixa é onde a proposta aparece, e
 * a forma dela é a CONDIÇÃO C1 da auditoria: o seletor continua nascendo VAZIO, e adotar a proposta
 * é um CLIQUE PRÓPRIO. Pré-preenchido, o valor da planilha ficaria indistinguível de um cliente
 * escolhido por gente, quem libera não mexeria no campo, e a trilha passaria a afirmar que uma
 * pessoa conferiu uma coisa que ninguém olhou.
 *
 * O QUE ELA NÃO FAZ, e as três ausências são decisão, não lacuna:
 *   . NÃO escreve nada sozinha. Quem grava o cliente é a liberação da vaga, que já tem autor e data;
 *   . NÃO oferece CRIAR CLIENTE. O catálogo `clientes` é da ADMISSÃO: ele resolve a régua documental
 *     `(cod_cliente + cargo)` e o nome da pasta do prontuário no Drive. Cliente criado às pressas por
 *     quem libera vaga nasceria sem régua e sem benefícios padrão, e viraria onze Gerdaus no
 *     catálogo. Quem cadastra é a administração, na tela de Clientes;
 *   . NÃO abre tela nem fluxo novo (§A.14/§A.31): é um bloco de texto e um botão dentro da trilha
 *     que já existe.
 *
 * §A.11 (nenhum travessão), §A.24 (title case em TAG; botão é comando e vai em escrita normal),
 * §A.6 (o nome da planilha aparece na tela e NUNCA em log, erro ou telemetria).
 */

export interface PropostaDeClienteDaPlanilhaProps {
  proposta: PropostaDeClienteDaVaga | null;
  /** O cliente que está no formulário agora. Vazio é o estado normal: ninguém conferiu ainda. */
  codClienteEscolhido: string;
  /** Os códigos que o seletor oferece, para não propor confirmar um cliente que saiu do catálogo. */
  codigosDoCatalogo: ReadonlySet<string>;
  /** Como o catálogo nomeia um código, para a caixa dizer o nome e não só o número. */
  nomeNoCatalogo: (codCliente: string) => string | undefined;
  /** Adotar a proposta. Chama o MESMO caminho de escolher no seletor, nada à parte. */
  onConfirmar: (codCliente: string) => void;
}

export function PropostaDeClienteDaPlanilha({
  proposta,
  codClienteEscolhido,
  codigosDoCatalogo,
  nomeNoCatalogo,
  onConfirmar,
}: PropostaDeClienteDaPlanilhaProps) {
  const conferencia: ConferenciaDaProposta = conferenciaDaProposta(
    proposta,
    codClienteEscolhido,
    codigosDoCatalogo,
  );

  if (conferencia.tipo === "SEM_PROPOSTA") return null;

  const p = conferencia.proposta;
  const origem = rotuloDaOrigem(p.origem);

  return (
    <div className="md:col-span-2" data-testid="proposta-de-cliente">
      <div
        className={
          conferencia.tipo === "COM_CODIGO" || conferencia.tipo === "SO_NOME"
            ? "rounded-xl border border-[rgba(214,158,46,0.45)] bg-[rgba(214,158,46,0.1)] px-3 py-3"
            : "rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {/* A TAG VEM DO CONTRATO (`ESTADO_DA_PROPOSTA_LABEL`), e não de texto escrito aqui: é o
              mesmo rótulo que o servidor usa para o mesmo estado. */}
          {conferencia.tipo === "COM_CODIGO" && (
            <StatusPill tone="wn" label={rotuloDoEstado("PROPOSTO")} />
          )}
          {conferencia.tipo === "SO_NOME" && (
            <StatusPill tone="wn" label="Proposta Sem Código No Catálogo" />
          )}
          {conferencia.tipo === "CONFIRMADA" && (
            <StatusPill tone="ok" label={rotuloDoEstado("CONFIRMADO")} />
          )}
          {conferencia.tipo === "ESCOLHA_PROPRIA" && (
            <StatusPill tone="in" label="Cliente Escolhido Por Você" icon="check" />
          )}
          {origem && <span className="text-[12px] text-faint">Casou {origem.toLowerCase()}.</span>}
        </div>

        {/* O NOME COMO ESTÁ NA PLANILHA, que é o que faz a pessoa reconhecer a vaga. */}
        <p className="text-sm">
          <span className="text-dim">Cliente na planilha do time: </span>
          <span className="font-semibold">{p.nomeClienteProposto}</span>
        </p>

        {conferencia.tipo === "COM_CODIGO" && (
          <>
            <p className="mt-1 text-sm">
              <span className="text-dim">Cliente no catálogo: </span>
              <span className="font-semibold">
                {nomeNoCatalogo(conferencia.codigo) ?? "não informado"}
              </span>
              <span className="text-faint"> ({conferencia.codigo})</span>
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warn-2">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
              Isto é uma proposta da fábrica, lida da planilha do time. Ninguém conferiu ainda, e o
              seletor acima continua vazio de propósito.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button className="py-2" onClick={() => onConfirmar(conferencia.codigo)}>
                Confirmar cliente
              </Button>
              <span className="text-[12.5px] text-dim">
                Confere? Clique em confirmar. Não confere? Escolha outro cliente no seletor acima.
              </span>
            </div>
          </>
        )}

        {conferencia.tipo === "SO_NOME" && (
          <>
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warn-2">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
              Este nome não está no catálogo de clientes da Admissão, então não há código para
              confirmar. Escolha no seletor acima qual cliente cadastrado corresponde.
            </p>
            <p className="mt-2 text-[12.5px] text-dim">
              Se nenhum corresponde, salve sem liberar e deixe pendente: cadastrar cliente é da
              administração, na tela de Clientes, porque o cadastro também define a régua de
              documentos e os padrões daquele cliente.
            </p>
          </>
        )}

        {conferencia.tipo === "CONFIRMADA" && (
          <p className="mt-2 text-[12.5px] text-dim">
            Você adotou a proposta da planilha. A gravação registra quem confirmou e quando. Para
            trocar, use o seletor acima.
          </p>
        )}

        {conferencia.tipo === "ESCOLHA_PROPRIA" && (
          <p className="mt-2 text-[12.5px] text-dim">
            Você escolheu{" "}
            <span className="font-semibold">
              {nomeNoCatalogo(conferencia.codigoEscolhido) ?? conferencia.codigoEscolhido}
            </span>
            , que não é o cliente proposto pela planilha. Vale a sua escolha.
          </p>
        )}
      </div>
    </div>
  );
}
