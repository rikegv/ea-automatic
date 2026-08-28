"use client";

/**
 * REGISTRAR CONTATO direto da fila, sem abrir a ficha inteira.
 *
 * POR QUE ELE EXISTE SEPARADO DA FICHA: quem acabou de desligar o telefone quer anotar e voltar para
 * a fila. Obrigar a abrir a ficha, achar a candidatura e rolar até o histórico transformaria uma
 * anotação de dez segundos em uma navegação. A ficha continua sendo o lugar de LER a história; este
 * é o de ESCREVER uma linha dela.
 *
 * QUANDO ACONTECEU É DIFERENTE DE QUANDO FOI DIGITADO, e o campo de data existe por isso: ligação de
 * ontem anotada hoje entra no lugar dela na linha do tempo. Em branco, vale agora.
 *
 * §A.6: o resumo é do PROCESSO ("não atendeu, retornar amanhã"), não ficha da pessoa. O texto de
 * apoio diz isso na tela, para o campo não virar depósito de dado pessoal.
 * §A.11 (sem travessão), §A.24 (title case em título).
 */

import { useState } from "react";
import {
  AS_CONTATO_TIPO,
  AS_CONTATO_TIPO_LABEL,
  CANDIDATURA_ETAPA_LABEL,
  type AsCandidaturaItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { mensagemDoErro, registrarContato } from "@/lib/as-candidatos";

export function RegistrarContatoModal({
  candidatura,
  token,
  onClose,
  onRegistrado,
}: {
  candidatura: AsCandidaturaItem;
  token: string | null;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState<string>("LIGACAO");
  const [resumo, setResumo] = useState("");
  /**
   * A DATA JÁ NASCE HOJE (ajuste 3 do diretor), e continua EDITÁVEL.
   *
   * O PADRÃO SEGUE O CASO COMUM: a esmagadora maioria dos contatos é registrada no momento em que
   * acontece, e deixar o campo vazio cobrava um clique de todo mundo para digitar a data de hoje.
   * O lançamento retroativo (a ligação de ontem digitada agora) continua possível: é só trocar.
   *
   * DATA LOCAL, e não `toISOString().slice(0,10)`: o ISO converte para UTC, e num fuso negativo como
   * o de São Paulo qualquer contato registrado depois das 21h nasceria com a data de AMANHÃ. O
   * `sv-SE` devolve exatamente `AAAA-MM-DD`, que é o formato que o input de data espera.
   */
  const [quando, setQuando] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await registrarContato(
        candidatura.id,
        {
          tipo,
          resumo: resumo.trim(),
          // O input de data devolve "yyyy-mm-dd"; o backend espera ISO 8601.
          ocorridoEm: quando ? new Date(`${quando}T12:00:00`).toISOString() : undefined,
        },
        token,
      );
      onRegistrado();
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao registrar o contato."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[560px] p-0" ariaLabel="Registrar contato">
      <div className="flex flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Registrar Contato</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {candidatura.candidatoNome} em{" "}
            {candidatura.vagaNome ?? candidatura.vagaCodigo ?? "não informado"}. Etapa atual:{" "}
            {CANDIDATURA_ETAPA_LABEL[candidatura.etapa]}.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-dim">Tipo</span>
            <Combobox
              value={tipo}
              onChange={setTipo}
              options={AS_CONTATO_TIPO.map((t) => ({ value: t, label: AS_CONTATO_TIPO_LABEL[t] }))}
              ariaLabel="Tipo de contato"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-dim">Quando aconteceu</span>
            <input
              className="ds-input"
              type="date"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <span className="text-[12px] text-faint">
              Em branco, vale agora. Preencha quando estiver anotando um contato de outro dia.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-dim">
              O que aconteceu<span className="ml-1 text-danger">*</span>
            </span>
            <textarea
              className="ds-input min-h-[90px] resize-y"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder="Não atendeu, retornar amanhã de manhã."
            />
            <span className="text-[12px] text-faint">
              Resumo do processo, não ficha da pessoa. Evite documentos e dados pessoais aqui.
            </span>
          </label>

          {erro && (
            <p
              className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            className="px-4 py-2.5"
            disabled={salvando || resumo.trim().length < 2}
            onClick={() => void salvar()}
          >
            {salvando ? "Registrando…" : "Registrar contato"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
