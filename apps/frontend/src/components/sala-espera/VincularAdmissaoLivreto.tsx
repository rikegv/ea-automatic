"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { caixaAlta } from "@/lib/nome";

export interface RegistroSala {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  email: string | null;
  dataRecebimento: string;
  origem: "CLIENTE" | "SELECAO";
  codCliente: string;
  clienteRazao: string | null;
  clienteOperacao: string | null;
  cargoNome: string | null;
  statusNome: string;
}

interface AdmissaoLiberacao {
  admissaoId: string;
  nome: string;
  cpf: string;
  dataNascimento: string | null;
  telefone: string | null;
  origem: string;
  criadoEm: string;
  codCliente: string | null;
  cargoId: string | null;
}

function rotuloCliente(cod: string, operacao?: string | null, razao?: string | null): string {
  const nome = operacao || razao || "";
  return nome ? `${cod} - ${nome}` : cod;
}
function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
function fmtCpf(cpf?: string | null): string {
  if (!cpf) return "não informado";
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

/** Uma linha de dado do lado esquerdo. Rótulo curto em cima, valor embaixo, sem competir por espaço. */
function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{rotulo}</div>
      {/* QUEBRA a linha em vez de cortar (§A.20): "Aguardando candidatura na vaga" é um status
          real do catálogo e não cabe numa meia-coluna. O card tem folga na vertical, a coluna não. */}
      <div
        className="break-words text-[13.5px] leading-snug text-text"
        title={typeof valor === "string" ? valor : undefined}
      >
        {valor}
      </div>
    </div>
  );
}

/**
 * O LIVRETO DO MATCH: a Sala de um lado, a fila da Liberação do outro.
 *
 * POR QUE PARTE DAQUI. O match já existia, mas só na tela de Liberação, e a pergunta que o time faz
 * na prática é a inversa: "este candidato que EU anunciei semana passada, já apareceu no Pandapé?".
 * Quem conhece o candidato é quem o cadastrou na Sala, então a busca tem de começar do lado dele.
 *
 * O LADO DIREITO NÃO FILTRA POR CLIENTE, e isso é a regra do domínio, não uma simplificação: a
 * admissão que chega do Pandapé **nasce sem cliente**, o cliente é justamente o que o time atribui
 * na liberação. Filtrar por cliente ali esconderia todo mundo. Por isso a identificação é NOME
 * COMPLETO + CPF + NASCIMENTO, que é o que existe dos dois lados.
 *
 * O QUE O VÍNCULO FAZ: leva cliente e cargo da Sala para a admissão, SÓ NOS CAMPOS VAZIOS, como
 * sugestão. O QUE ELE NÃO FAZ: não libera, não abre auditoria nem exame, não mexe em farol. Liberar
 * continua sendo passo à parte, na tela de Liberação, com o time revisando.
 */
export function VincularAdmissaoLivreto({
  registro,
  onFechar,
  onVinculado,
}: {
  registro: RegistroSala;
  onFechar: () => void;
  onVinculado: (nomeAdmissao: string) => void;
}) {
  const { token } = useAuth();
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<AdmissaoLiberacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<AdmissaoLiberacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setItens(
        await apiFetch<AdmissaoLiberacao[]>("/sala-espera/admissoes-para-vincular", { token }),
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar as admissões da Liberação.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Busca CLIENT-SIDE de propósito: a fila de liberação é curta por natureza (é trabalho do dia), já
   * veio inteira, e filtrar em memória responde a cada tecla sem ida à rede. Nome sem acento e CPF
   * só por dígitos, então "joao" acha "JOÃO" e "123.456" acha o CPF pontuado.
   */
  const filtradas = useMemo(() => {
    const t = busca.trim();
    if (!t) return itens;
    const semAcento = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const alvo = semAcento(t);
    const digitos = t.replace(/\D/g, "");
    return itens.filter(
      (a) =>
        semAcento(a.nome).includes(alvo) ||
        (digitos.length >= 2 && a.cpf.includes(digitos)) ||
        (digitos.length >= 2 && (a.telefone ?? "").replace(/\D/g, "").includes(digitos)),
    );
  }, [busca, itens]);

  /** O CPF dos dois lados bate? É identidade, não semelhança, e merece o destaque na lista. */
  const cpfSala = (registro.cpf ?? "").replace(/\D/g, "");

  async function confirmar() {
    if (!escolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/sala-espera/${registro.id}/vincular`, {
        method: "POST",
        token,
        body: { admissaoId: escolhida.admissaoId, prePreencherAdmissao: true },
      });
      onVinculado(escolhida.nome);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao vincular.");
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onFechar} ariaLabel="Vincular admissão" className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Sala De Espera</div>
          <h2 className="text-base font-semibold text-text">Vincular Admissão</h2>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-md p-1 text-faint transition hover:text-text"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      {erro && <p className="px-6 pt-4 text-[13px] text-danger">{erro}</p>}

      {/* O LIVRETO: duas páginas e uma lombada no meio. Em tela estreita as páginas empilham, e a
          lombada vira uma linha horizontal, para nada ser espremido (§A.20). */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1.15fr]">
        {/* ── PÁGINA ESQUERDA: quem já esperava ─────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="eyebrow !mb-2">Quem Esperava</div>
          <div
            className={
              "rounded-2xl border p-4 transition duration-300 " +
              (escolhida
                ? "border-[rgba(45,138,86,0.45)] bg-[rgba(45,138,86,0.07)] shadow-[0_0_0_3px_rgba(45,138,86,0.10)]"
                : "border-[var(--border)] bg-[var(--surface-2)]")
            }
          >
            {/* Nome ocupa a linha inteira: é o campo mais longo de qualquer cadastro. */}
            <div className="mb-3 text-[15px] font-semibold leading-snug text-text">
              {caixaAlta(registro.nome)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <Campo
                  rotulo="Cliente"
                  valor={rotuloCliente(
                    registro.codCliente,
                    registro.clienteOperacao,
                    registro.clienteRazao,
                  )}
                />
              </div>
              <Campo rotulo="Cargo" valor={registro.cargoNome ?? "não informado"} />
              <Campo rotulo="Status" valor={registro.statusNome} />
              <Campo rotulo="Recebido em" valor={fmtData(registro.dataRecebimento)} />
              <Campo
                rotulo="Origem"
                valor={registro.origem === "CLIENTE" ? "Cliente" : "Seleção"}
              />
              <Campo rotulo="CPF" valor={fmtCpf(registro.cpf)} />
              <Campo rotulo="Nascimento" valor={fmtData(registro.dataNascimento)} />
              <div className="col-span-2">
                <Campo rotulo="Telefone" valor={registro.telefone ?? "não informado"} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-faint">
            O cliente e o cargo daqui vão para a admissão como sugestão, e só nos campos que
            estiverem vazios.
          </p>
        </div>

        {/* ── LOMBADA: o elo. Fechado quando há match, aberto enquanto se procura ── */}
        <div className="relative flex items-center justify-center px-2 py-2 md:px-0 md:py-6">
          <div
            className="absolute inset-x-6 top-1/2 h-px md:inset-x-auto md:inset-y-6 md:left-1/2 md:h-auto md:w-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--border), transparent)",
            }}
          />
          <div
            className={
              "relative grid h-9 w-9 place-items-center rounded-full border transition duration-300 " +
              (escolhida
                ? "border-[rgba(45,138,86,0.5)] bg-[rgba(45,138,86,0.14)] text-ok"
                : "border-[var(--border)] bg-[var(--surface)] text-faint")
            }
          >
            <Icon name={escolhida ? "check" : "right"} className="h-4 w-4" />
          </div>
        </div>

        {/* ── PÁGINA DIREITA: a fila da Liberação ───────────────────────────── */}
        <div className="px-6 py-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="eyebrow !mb-0">Admissões Na Liberação</div>
            <span className="text-[11.5px] text-faint">
              {filtradas.length} de {itens.length}
            </span>
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone"
            aria-label="Buscar admissão na Liberação"
            className="ds-input mb-3 w-full"
          />
          {/* Sem filtro de cliente aqui, de propósito: a admissão do Pandapé nasce sem cliente. */}
          <div className="ea-scroll max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {carregando ? (
              <p className="py-10 text-center text-[13px] text-faint">Carregando a fila…</p>
            ) : filtradas.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-faint">
                {itens.length === 0
                  ? "Nenhuma admissão aguardando liberação no momento."
                  : "Nenhuma admissão encontrada para essa busca."}
              </p>
            ) : (
              filtradas.map((a) => {
                const sel = escolhida?.admissaoId === a.admissaoId;
                const mesmoCpf = cpfSala.length === 11 && a.cpf.replace(/\D/g, "") === cpfSala;
                return (
                  <button
                    key={a.admissaoId}
                    type="button"
                    onClick={() => setEscolhida(sel ? null : a)}
                    className={
                      "w-full rounded-xl border px-4 py-3 text-left transition duration-200 " +
                      (sel
                        ? "border-[rgba(45,138,86,0.5)] bg-[rgba(45,138,86,0.10)] shadow-[0_0_0_3px_rgba(45,138,86,0.10)]"
                        : "border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-text">
                        {caixaAlta(a.nome)}
                      </span>
                      {mesmoCpf && (
                        <span className="flex-none rounded-full bg-[rgba(45,138,86,0.15)] px-2 py-0.5 text-[10.5px] font-semibold text-ok">
                          CPF Confere
                        </span>
                      )}
                      {sel && !mesmoCpf && (
                        <Icon name="check" className="h-4 w-4 flex-none text-ok" />
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-faint">
                      <span className="font-mono">{fmtCpf(a.cpf)}</span>
                      <span>Nasc. {fmtData(a.dataNascimento)}</span>
                      {a.telefone && <span>{a.telefone}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── RODAPÉ: a pergunta só aparece quando há os DOIS lados ─────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-6 py-4">
        {escolhida ? (
          <>
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-text">
              <Icon name="check" className="h-4 w-4 flex-none text-ok" />
              <span className="truncate">
                Vincular esta admissão?{" "}
                <span className="font-semibold">{caixaAlta(escolhida.nome)}</span>
              </span>
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => setEscolhida(null)} disabled={salvando}>
                Escolher outra
              </Button>
              <Button onClick={() => void confirmar()} disabled={salvando}>
                {salvando ? "Vinculando…" : "Sim, vincular"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[12.5px] text-faint">
              Escolha a admissão correspondente na lista à direita.
            </span>
            <Button variant="secondary" className="ml-auto" onClick={onFechar}>
              Cancelar
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
