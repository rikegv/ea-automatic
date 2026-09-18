"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { cn } from "@/lib/cn";
import { dataBr } from "@/lib/as-candidatos";
import {
  carregarFilaDeRevisao,
  carregarLiberadasDaRevisao,
  corrigirLiberacaoDeRevisao,
  liberarVagaPendenteRevisao,
  reguaDeLiberacao,
  type VagaEmRevisao,
} from "@/lib/as-vagas-revisao";

/**
 * ─ VAGAS PENDENTES DE REVISÃO ──────────────────────────────────────────────────────────────────
 *
 * A FILA DE TRABALHO DE QUEM CONFERE O QUE A VARREDURA TROUXE. A varredura do Pandapé espelha, no
 * EA, vagas que NINGUÉM abriu aqui: elas nascem no status `PENDENTE_REVISAO` e com o `cod_cliente`
 * NULO, porque o cliente não tem caminho na API do ATS (medido). A tela existe para uma pessoa
 * vincular o cliente que falta e liberar a vaga para a operação.
 *
 * O MODELO É A LIBERAÇÃO ADMISSIONAL (`app/(app)/liberacao/page.tsx`), e o padrão copiado é o dela:
 * FILA, CONTADOR e AÇÃO INDIVIDUAL. A fila é o próprio estado, não uma marcação: liberou, a vaga
 * sai daqui sozinha, sem ninguém dar baixa em nada.
 *
 * ┌─ NÃO EXISTE LOTE, E A AUSÊNCIA É A DECISÃO ────────────────────────────────────────────────┐
 * │ A auditoria de segurança vetou a liberação em lote. Um cliente errado aplicado a 600 vagas  │
 * │ de uma vez atribuiria centenas de pessoas ao controlador errado, e o erro só apareceria     │
 * │ depois, espalhado. Uma vaga por vez, com o cliente escolhido olhando a vaga.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TRAVA DE VERDADE É DO SERVIDOR. O botão desabilitado e a frase de recusa são o AVISO: eles
 * existem para ninguém clicar no que seria recusado, e para dizer o que fazer. Quem recusa é a rota.
 *
 * §A.12 (máscara única de tabela), §A.20 (larguras que aproveitam o espaço, nada esmagado),
 * §A.24 (title case em título, aba e tag; botão é comando e vai em escrita normal),
 * §A.29 (ordenação clicável, pelo `useOrdenacao`/`ColunaOrdenavel` que já existem),
 * §A.35 (o `Combobox` do design system, com busca: a lista de clientes passa de 200 linhas),
 * §A.41 (o modal fecha por Cancelar ou Salvar, nunca por clique fora).
 *
 * §A.23: o menu `as-vagas-revisao` nasce SÓ PARA O SUPER_ADMIN. Não aparecer para os demais não é
 * bug, é o diretor ainda não ter liberado.
 *
 * §A.6: aqui transitam vaga, cliente e cargo. Nenhum dado pessoal de candidato entra nesta tela.
 */

/** O cliente como o `/as/vagas/opcoes` serve. É o MESMO catálogo que a Central de Vagas consome. */
interface OpcaoCliente {
  codCliente: string;
  rotulo: string;
  cnpj: string | null;
}

type Aba = "pendentes" | "liberadas";

export default function VagasPendentesDeRevisaoPage() {
  const { token, isAdmin } = useAuth();

  const [aba, setAba] = useState<Aba>("pendentes");
  const [pendentes, setPendentes] = useState<VagaEmRevisao[]>([]);
  const [liberadas, setLiberadas] = useState<VagaEmRevisao[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [revisarAlvo, setRevisarAlvo] = useState<VagaEmRevisao | null>(null);
  const [corrigirAlvo, setCorrigirAlvo] = useState<VagaEmRevisao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      /*
       * AS TRÊS LEITURAS EM PARALELO, e a das LIBERADAS só para quem pode corrigir: pedir ao
       * servidor uma lista que a tela não vai desenhar é gastar consulta e, pior, é alcançar uma
       * rota restrita com quem não tem o papel, o que devolveria 403 e derrubaria as outras duas
       * junto no `Promise.all`.
       */
      const [fila, opcoes, jaLiberadas] = await Promise.all([
        carregarFilaDeRevisao(token),
        apiFetch<{ clientes: OpcaoCliente[] }>("/as/vagas/opcoes", { token }),
        isAdmin ? carregarLiberadasDaRevisao(token) : Promise.resolve([] as VagaEmRevisao[]),
      ]);
      setPendentes(fila);
      setClientes(opcoes.clientes);
      setLiberadas(jaLiberadas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a fila de revisão.");
    } finally {
      setCarregando(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * AS OPÇÕES DE CLIENTE VÊM DO ENDPOINT, NUNCA DAS LINHAS CARREGADAS (§A.37). Derivadas das linhas
   * elas seriam a lista VAZIA, porque é exatamente o cliente que falta em toda vaga desta fila.
   *
   * O DESEMPATE É O MESMO DA CENTRAL DE VAGAS, e pelo mesmo motivo medido: dos clientes ativos, uma
   * parte grande repete a razão social, então o nome sozinho não distingue uma filial da outra. O
   * apoio vai no `hint`, e o código do cliente entra na `busca` para quem o decorou continuar
   * achando por ele.
   */
  const optClientes = useMemo(() => {
    const porNome = new Map<string, number>();
    const porNomeCnpj = new Map<string, number>();
    for (const c of clientes) {
      porNome.set(c.rotulo, (porNome.get(c.rotulo) ?? 0) + 1);
      porNomeCnpj.set(
        `${c.rotulo}|${c.cnpj ?? ""}`,
        (porNomeCnpj.get(`${c.rotulo}|${c.cnpj ?? ""}`) ?? 0) + 1,
      );
    }
    return clientes.map((c) => {
      const nomeRepetido = (porNome.get(c.rotulo) ?? 0) > 1;
      const cnpjDesempata = !!c.cnpj && (porNomeCnpj.get(`${c.rotulo}|${c.cnpj}`) ?? 0) === 1;
      return {
        value: c.codCliente,
        label: c.rotulo,
        hint: nomeRepetido ? (cnpjDesempata ? (c.cnpj as string) : c.codCliente) : undefined,
        busca: c.codCliente,
      };
    });
  }, [clientes]);

  const linhas = aba === "pendentes" ? pendentes : liberadas;

  /** Busca da tela, no espírito da Liberação Admissional: código, nome de divulgação e cargo. */
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((v) =>
      [v.codigo, v.nomeDivulgacao, v.cargoNome, v.clienteNome]
        .filter(Boolean)
        .some((t) => (t as string).toLowerCase().includes(q)),
    );
  }, [linhas, busca]);

  const colunas = useMemo<ColOrd<VagaEmRevisao>[]>(
    () => [
      { chave: "codigo", tipo: "texto", valor: (v) => v.codigo },
      { chave: "vaga", tipo: "texto", valor: (v) => v.nomeDivulgacao },
      { chave: "cargo", tipo: "texto", valor: (v) => v.cargoNome },
      { chave: "cliente", tipo: "texto", valor: (v) => v.clienteNome },
      { chave: "cidade", tipo: "texto", valor: (v) => v.cidadeNome },
      { chave: "posicoes", tipo: "numero", valor: (v) => v.posicoesOficiais },
      // Quanta gente a vaga já carrega. É o número que diz o TAMANHO do estrago de liberar com o
      // cliente errado, então ele fica na fila e não escondido num painel.
      { chave: "candidatos", tipo: "numero", valor: (v) => v.ocupacao?.emSelecao ?? 0 },
      { chave: "entrada", tipo: "data", valor: (v) => v.criadoEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, filtradas);

  const semCliente = pendentes.filter((v) => !v.codCliente).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Vagas Pendentes De Revisão"
        subtitle="Vagas que entraram sozinhas pela varredura do Pandapé e ainda não foram conferidas. Vincule o cliente que falta e libere, uma de cada vez."
      />

      {/* O CONTADOR, que é o que a fila promete: quantas esperam, e de quantas falta o cliente. Não
          é card clicável nem filtro: a fila inteira JÁ é o recorte, e um filtro aqui só teria como
          esconder trabalho de dentro de uma tela que existe para mostrar trabalho. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {carregando
            ? "Carregando a fila de revisão."
            : `${pendentes.length} ${pendentes.length === 1 ? "vaga espera" : "vagas esperam"} revisão, ${semCliente} sem cliente vinculado.`}
        </p>
        <div className="flex items-center gap-2">
          <input
            className="ds-input w-[260px] py-2 text-sm"
            placeholder="Buscar por vaga, cargo ou cliente"
            aria-label="Buscar na fila de revisão"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button variant="secondary" className="py-2" onClick={() => void carregar()}>
            Atualizar
          </Button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      {/* AS ABAS (§A.24, rótulo de aba é TAG, então title case). A segunda só existe para quem pode
          corrigir: ela lista vagas que JÁ saíram da fila, e oferecê-la a quem não é Master seria
          mostrar a porta e trancá-la. */}
      {isAdmin && (
        <div className="mb-3 flex gap-2">
          {(
            [
              ["pendentes", `Pendentes De Revisão (${pendentes.length})`],
              ["liberadas", `Liberadas Recentemente (${liberadas.length})`],
            ] as [Aba, string][]
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition",
                aba === id
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] text-dim hover:text-text",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* A LARGURA MÍNIMA É A SOMA DO QUE CADA COLUNA PRECISA para não esmagar ninguém (§A.20):
              abaixo dela a tabela ROLA na horizontal, em vez de espremer nome de vaga e de cliente. */}
          <table className="ds-table min-w-[1180px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[120px]">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga">
                  Nome De Divulgação
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[180px]">
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[200px]">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cidade" className="w-[130px]">
                  Cidade
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="posicoes" className="w-[100px]">
                  Posições
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="candidatos" className="w-[120px]">
                  Candidatos
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="entrada" className="w-[120px]">
                  Entrada
                </ColunaOrdenavel>
                {/* Largura medida no rótulo mais longo do botão, que cabe em UMA linha (§A.20). */}
                <th className="w-[190px]">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    {busca
                      ? "Nenhuma vaga encontrada para a busca."
                      : aba === "pendentes"
                        ? "Nenhuma vaga esperando revisão."
                        : "Nenhuma vaga liberada pela revisão até agora."}
                  </td>
                </tr>
              ) : (
                ord.itens.map((v) => {
                  const regua = reguaDeLiberacao(v);
                  return (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap font-mono text-[12.5px]">
                        {v.codigo ?? "não informado"}
                      </td>
                      <td className="font-semibold">{v.nomeDivulgacao ?? "não informado"}</td>
                      <td className="text-center">{v.cargoNome ?? "não informado"}</td>
                      {/* A COLUNA QUE A FILA EXISTE PARA RESOLVER. §A.12: o ícone acompanha o estado
                          real, então a pill é o X vermelho enquanto falta o cliente e o check verde
                          quando ele já está vinculado. Ela nunca é fixa. */}
                      <td className="text-center">
                        {v.clienteNome ? (
                          <StatusPill tone="ok" label={v.clienteNome} />
                        ) : (
                          <StatusPill tone="dg" label="Sem Cliente" title={regua.motivo} />
                        )}
                      </td>
                      <td className="text-center">
                        {v.cidadeNome
                          ? `${v.cidadeNome}${v.cidadeUf ? `/${v.cidadeUf}` : ""}`
                          : "não informado"}
                      </td>
                      <td className="text-center">{v.posicoesOficiais ?? "não informado"}</td>
                      <td className="text-center">{v.ocupacao?.emSelecao ?? 0}</td>
                      <td className="whitespace-nowrap text-center">{dataBr(v.criadoEm)}</td>
                      <td>
                        {aba === "pendentes" ? (
                          <Button
                            className="w-full whitespace-nowrap py-2"
                            onClick={() => setRevisarAlvo(v)}
                          >
                            Revisar vaga
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="w-full whitespace-nowrap py-2"
                            onClick={() => setCorrigirAlvo(v)}
                          >
                            Corrigir liberação
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {revisarAlvo && (
        <RevisarVagaModal
          vaga={revisarAlvo}
          clientes={optClientes}
          token={token}
          onClose={() => setRevisarAlvo(null)}
          onLiberada={() => {
            setRevisarAlvo(null);
            void carregar();
          }}
        />
      )}

      {corrigirAlvo && (
        <CorrigirLiberacaoModal
          vaga={corrigirAlvo}
          clientes={optClientes}
          token={token}
          onClose={() => setCorrigirAlvo(null)}
          onCorrigida={() => {
            setCorrigirAlvo(null);
            void carregar();
          }}
        />
      )}
    </>
  );
}

/** As opções já prontas para o `Combobox`, montadas uma vez pela página. */
type OpcoesCliente = { value: string; label: string; hint?: string; busca?: string }[];

/**
 * ─ REVISAR A VAGA: vincular o cliente e liberar ────────────────────────────────────────────────
 *
 * §A.41: modal de PREENCHIMENTO, então ele fecha por "Cancelar" ou pela ação de salvar, e NUNCA por
 * clique fora (quem garante isso é o `ui/Modal`, para o sistema inteiro). A tecla Escape continua
 * fechando, que é a saída de teclado.
 *
 * O BOTÃO NASCE DESABILITADO ENQUANTO NÃO HÁ CLIENTE, com a frase ao lado dizendo por quê. A trava
 * é do servidor; isto é o aviso, e os dois existem de propósito.
 */
function RevisarVagaModal({
  vaga,
  clientes,
  token,
  onClose,
  onLiberada,
}: {
  vaga: VagaEmRevisao;
  clientes: OpcoesCliente;
  token?: string | null;
  onClose: () => void;
  onLiberada: () => void;
}) {
  const [codCliente, setCodCliente] = useState<string>(vaga.codCliente ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const regua = reguaDeLiberacao({ codCliente: codCliente || null });

  async function liberar() {
    if (!regua.pode) return;
    setSalvando(true);
    setErro(null);
    try {
      await liberarVagaPendenteRevisao(vaga.id, codCliente, token);
      onLiberada();
    } catch (e) {
      // A MENSAGEM É A DO BACKEND, sempre: é ela que sabe por que recusou, e reescrever aqui criaria
      // uma segunda versão da mesma regra, que envelhece primeiro.
      setErro(e instanceof Error ? e.message : "Não foi possível liberar a vaga.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Revisar a vaga" className="max-w-[560px]">
      <div className="p-5">
        <h2 className="text-lg font-extrabold">Revisar A Vaga</h2>
        <p className="mt-1 text-sm text-dim">
          Esta vaga entrou sozinha pela varredura do Pandapé. Confira os dados, escolha o cliente e
          libere para a operação.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <Campo rotulo="Vaga" valor={vaga.codigo} />
          <Campo rotulo="Nome de divulgação" valor={vaga.nomeDivulgacao} />
          <Campo rotulo="Cargo" valor={vaga.cargoNome} />
          <Campo
            rotulo="Cidade"
            valor={vaga.cidadeNome ? `${vaga.cidadeNome}${vaga.cidadeUf ? `/${vaga.cidadeUf}` : ""}` : null}
          />
          <Campo rotulo="Posições oficiais" valor={vaga.posicoesOficiais?.toString() ?? null} />
          <Campo rotulo="Candidatos em processo" valor={String(vaga.ocupacao?.emSelecao ?? 0)} />
        </dl>

        <label className="mt-4 block text-[13px] font-semibold" htmlFor="cliente-da-revisao">
          Cliente
        </label>
        <Combobox
          id="cliente-da-revisao"
          value={codCliente}
          onChange={(v) => setCodCliente(v)}
          options={clientes}
          placeholder="Escolher o cliente"
          ariaLabel="Cliente da vaga"
          searchable
          limpavel
          invalido={!regua.pode}
          className="mt-1"
        />
        {!regua.pode && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warn-2">
            <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
            {regua.motivo}
          </p>
        )}

        {erro && (
          <p className="mt-3 rounded-lg border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.1)] px-3 py-2 text-[12.5px] text-danger">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void liberar()} disabled={!regua.pode || salvando}>
            {salvando ? "Liberando…" : "Vincular cliente e liberar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * ─ A CORREÇÃO DO MASTER ────────────────────────────────────────────────────────────────────────
 *
 * O QUE ELA RESOLVE: alguém liberou com o cliente errado. Aqui o Master troca o cliente e, se quiser
 * que a vaga volte a ser conferida do zero, devolve a vaga para a fila no mesmo gesto.
 *
 * SÓ MASTER E SUPER_ADMIN CHEGAM AQUI, e quem decide isso é o servidor. A tela esconde o gesto
 * porque oferecer o que o backend vai recusar vira chamado, não porque esconder proteja algo.
 */
function CorrigirLiberacaoModal({
  vaga,
  clientes,
  token,
  onClose,
  onCorrigida,
}: {
  vaga: VagaEmRevisao;
  clientes: OpcoesCliente;
  token?: string | null;
  onClose: () => void;
  onCorrigida: () => void;
}) {
  const [codCliente, setCodCliente] = useState<string>(vaga.codCliente ?? "");
  const [devolver, setDevolver] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const semCliente = !codCliente;
  const semMudanca = codCliente === (vaga.codCliente ?? "") && !devolver;

  async function salvar() {
    if (semCliente || semMudanca) return;
    setSalvando(true);
    setErro(null);
    try {
      await corrigirLiberacaoDeRevisao(vaga.id, { codCliente, devolverParaFila: devolver }, token);
      onCorrigida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível corrigir a liberação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Corrigir a liberação" className="max-w-[560px]">
      <div className="p-5">
        <h2 className="text-lg font-extrabold">Corrigir A Liberação</h2>
        <p className="mt-1 text-sm text-dim">
          Troque o cliente da vaga e, se for o caso, devolva a vaga para a fila de revisão. A
          correção fica registrada pelo servidor.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <Campo rotulo="Vaga" valor={vaga.codigo} />
          <Campo rotulo="Nome de divulgação" valor={vaga.nomeDivulgacao} />
          <Campo rotulo="Cliente atual" valor={vaga.clienteNome} />
          <Campo rotulo="Candidatos em processo" valor={String(vaga.ocupacao?.emSelecao ?? 0)} />
        </dl>

        <label className="mt-4 block text-[13px] font-semibold" htmlFor="cliente-da-correcao">
          Cliente
        </label>
        <Combobox
          id="cliente-da-correcao"
          value={codCliente}
          onChange={(v) => setCodCliente(v)}
          options={clientes}
          placeholder="Escolher o cliente"
          ariaLabel="Cliente da vaga"
          searchable
          limpavel
          invalido={semCliente}
          className="mt-1"
        />

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-[3px] h-4 w-4 cursor-pointer accent-[var(--accent)]"
            checked={devolver}
            onChange={(e) => setDevolver(e.target.checked)}
          />
          <span>
            Devolver a vaga para a fila de revisão.
            <span className="block text-[12.5px] text-dim">
              A vaga volta a aparecer como pendente e precisa ser liberada de novo.
            </span>
          </span>
        </label>

        {semCliente && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warn-2">
            <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
            A correção precisa de um cliente. Escolha para quem esta vaga é.
          </p>
        )}

        {erro && (
          <p className="mt-3 rounded-lg border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.1)] px-3 py-2 text-[12.5px] text-danger">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={semCliente || semMudanca || salvando}>
            {salvando ? "Salvando…" : "Salvar correção"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Um par rótulo/valor do resumo da vaga. Célula vazia escreve "não informado" (§A.11). */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</dt>
      <dd className="font-semibold">{valor ?? "não informado"}</dd>
    </div>
  );
}
