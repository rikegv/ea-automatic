"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImportarLojasModal } from "@/components/admin/ImportarLojasModal";

/**
 * CATÁLOGO DE LOJAS DE UM CLIENTE (cenário 1, `docs/DESENHO-LOJAS-UNIDADES.md`, etapa 1).
 *
 * Mora DENTRO da ficha expandida do cliente, e não em tela própria, porque a loja não existe fora do
 * cliente: o `codCliente` vem do contexto e nunca é digitado. É a mesma razão pela qual a rota é
 * aninhada em `admin/clientes/:codCliente/lojas`.
 *
 * O QUE ELE SUBSTITUI: o nome da loja era escrito no campo CENTRO DE CUSTO, em texto livre, porque
 * não havia onde cadastrar. Seis clientes produziram 170 nomes distintos assim.
 *
 * CARREGA SOB DEMANDA: a lista só é buscada quando a ficha do cliente abre. A tela tem 247 clientes,
 * e buscar as lojas de todos no carregamento seriam 247 requisições para mostrar zero linha na
 * imensa maioria.
 *
 * INATIVAR É EXCLUSÃO LÓGICA: a loja sai das opções selecionáveis e o histórico de quem foi admitido
 * nela continua legível. Reversível pela reativação, como nos demais catálogos.
 *
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case.
 */

export interface Loja {
  id: string;
  codCliente: string;
  nome: string;
  endereco: string | null;
  codigoExterno: string | null;
  ativo: boolean;
}

const VAZIO = { nome: "", endereco: "", codigoExterno: "" };

export function LojasDoCliente({ codCliente }: { codCliente: string }) {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // INATIVAS FORA DA LISTA PRINCIPAL (decisão do diretor): elas poluíam a lista de quem opera, que
  // só precisa das que pode escolher. Ficam atrás de um botão, num modal, com a reativação ali.
  const [modalInativas, setModalInativas] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLojas(await apiFetch<Loja[]>(`/admin/clientes/${codCliente}/lojas`));
    } catch {
      setErro("Não foi possível carregar as lojas deste cliente.");
    } finally {
      setCarregando(false);
    }
  }, [codCliente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function limpar() {
    setForm(VAZIO);
    setEditandoId(null);
    setErro(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const nome = form.nome.trim();
    // O ENDEREÇO É COBRADO AQUI, na tela, e não no DTO. A API o aceita vazio de propósito, porque a
    // importação da etapa 2 traz só os nomes do legado (endereço não existe em lugar nenhum hoje) e
    // exigi-lo no contrato travaria a carga inteira. Quem cadastra à mão sabe o endereço.
    if (!nome) return setErro("O nome da loja é obrigatório.");
    if (!form.endereco.trim()) return setErro("O endereço é obrigatório no cadastro manual.");

    setSalvando(true);
    setErro(null);
    const corpo = {
      nome,
      endereco: form.endereco.trim(),
      codigoExterno: form.codigoExterno.trim(),
    };
    try {
      if (editandoId) {
        await apiFetch(`/admin/clientes/${codCliente}/lojas/${editandoId}`, {
          method: "PATCH",
          body: corpo,
        });
      } else {
        await apiFetch(`/admin/clientes/${codCliente}/lojas`, { method: "POST", body: corpo });
      }
      limpar();
      await carregar();
    } catch (err) {
      // O 409 do backend explica o que fazer (reativar em vez de recriar); mostrar a mensagem dele é
      // melhor do que um texto genérico nosso.
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a loja.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(loja: Loja) {
    setErro(null);
    try {
      if (loja.ativo) {
        await apiFetch(`/admin/clientes/${codCliente}/lojas/${loja.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/admin/clientes/${codCliente}/lojas/${loja.id}/reativar`, {
          method: "PATCH",
        });
      }
      await carregar();
    } catch {
      setErro("Não foi possível alterar o status da loja.");
    }
  }

  function editar(loja: Loja) {
    setEditandoId(loja.id);
    setForm({
      nome: loja.nome,
      endereco: loja.endereco ?? "",
      codigoExterno: loja.codigoExterno ?? "",
    });
    setErro(null);
  }

  // A lista principal mostra SÓ as ATIVAS. As inativas continuam existindo (o vínculo das admissões
  // que já as usam permanece legível), mas saem daqui e vivem no modal.
  const ativas = lojas.filter((l) => l.ativo);
  const inativas = lojas.filter((l) => !l.ativo);

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Lojas E Unidades</h3>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-dim">
            {carregando
              ? "carregando"
              : ativas.length === 0
                ? "nenhuma loja ativa, a admissão fica só no nome do cliente"
                : `${ativas.length} ativa${ativas.length === 1 ? "" : "s"}`}
          </span>
          {/* O botão só existe quando HÁ inativas. Desabilitado seria um botão morto na tela da
              imensa maioria dos clientes, que nunca inativou nada: mais limpo é não desenhar. */}
          {inativas.length > 0 && (
            <button
              type="button"
              onClick={() => setModalInativas(true)}
              className="text-xs text-accent hover:underline"
            >
              Mostrar Inativas ({inativas.length})
            </button>
          )}
          {/* IMPORTAÇÃO POR PLANILHA (etapa 2). Sempre disponível: é o caminho para quem tem 60
              lojas e não vai digitar uma a uma. */}
          <button
            type="button"
            onClick={() => setModalImportar(true)}
            className="text-xs text-accent hover:underline"
          >
            Importar Planilha
          </button>
        </div>
      </div>

      {erro && (
        <p className="mb-3 rounded-lg border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] px-3 py-2 text-xs text-[var(--danger)]">
          {erro}
        </p>
      )}

      {ativas.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="ds-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-center">Nome</th>
                <th className="text-center">Endereço</th>
                <th className="text-center">Código</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {ativas.map((l) => (
                <tr key={l.id}>
                  <td className="font-semibold">{l.nome}</td>
                  <td className="text-dim">
                    {l.endereco ?? <span className="text-faint">não informado</span>}
                  </td>
                  <td className="font-mono">
                    {l.codigoExterno ?? <span className="text-faint">não informado</span>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => editar(l)} className="text-accent hover:underline">
                      editar
                    </button>
                    <span className="px-2 text-faint">·</span>
                    <button
                      onClick={() => void alternarAtivo(l)}
                      className="text-danger hover:underline"
                    >
                      inativar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={salvar} className="grid gap-2 sm:grid-cols-[1.2fr_1.6fr_0.8fr_auto]">
        <input
          className="ds-input"
          placeholder="Nome da loja"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          maxLength={200}
        />
        <input
          className="ds-input"
          placeholder="Endereço"
          value={form.endereco}
          onChange={(e) => setForm({ ...form, endereco: e.target.value })}
          maxLength={300}
        />
        <input
          className="ds-input"
          placeholder="Código (opcional)"
          value={form.codigoExterno}
          onChange={(e) => setForm({ ...form, codigoExterno: e.target.value })}
          maxLength={60}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={salvando}>
            {editandoId ? "Salvar" : "Adicionar"}
          </Button>
          {editandoId && (
            <Button type="button" variant="secondary" onClick={limpar}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {/* MODAL DAS INATIVAS. Elas continuam existindo e o vínculo das admissões que já as usam segue
          legível: o que muda é que saem da lista de quem opera, porque loja fechada não é escolha
          possível. A reativação mora aqui, que é onde o diretor vai procurá-la. */}
      {modalImportar && (
        <ImportarLojasModal
          codCliente={codCliente}
          onClose={() => setModalImportar(false)}
          onImportado={() => void carregar()}
        />
      )}

      {modalInativas && (
        <Modal
          onClose={() => setModalInativas(false)}
          ariaLabel="Lojas inativas"
          className="max-w-[620px] p-6"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Lojas E Unidades</div>
            <h2 className="font-display text-xl font-bold">Lojas Inativas</h2>
            <p className="mt-1 text-[13px] text-dim">
              Elas não aparecem para escolha em admissão nova. As admissões que já usam alguma delas
              continuam válidas. Reativar devolve a loja à lista.
            </p>
          </div>

          {inativas.length === 0 ? (
            <p className="text-sm text-dim">Nenhuma loja inativa neste cliente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-center">Nome</th>
                    <th className="text-center">Endereço</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {inativas.map((l) => (
                    <tr key={l.id}>
                      <td className="font-semibold">{l.nome}</td>
                      <td className="text-dim">
                        {l.endereco ?? <span className="text-faint">não informado</span>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          onClick={() => void alternarAtivo(l)}
                          className="text-accent hover:underline"
                        >
                          reativar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={() => setModalInativas(false)}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
