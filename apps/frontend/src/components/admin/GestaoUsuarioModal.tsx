"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AREA,
  AREA_LABEL,
  PAPEL_AS,
  PAPEL_AS_LABEL,
  type Area,
  type Papel,
  type PapelAs,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";

/**
 * Usuário como a tela de Usuários o conhece. Repetido aqui (e não importado da página) porque o modal
 * é consumido por ela e o acoplamento inverso, modal importando da página, criaria um ciclo.
 */
export interface UsuarioModal {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  papelAs?: PapelAs | null;
  areas?: Area[];
}

const PAPEL_OPTIONS = [
  { value: "COMUM", label: "Comum" },
  { value: "MASTER", label: "Master" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

/**
 * PAPEL DE A&S no seletor. O valor vazio é opção de verdade, não placeholder: é o estado de quem não
 * trabalha na frente de vagas, que é quase todo mundo, e na edição ele é o que LIMPA o papel.
 */
const PAPEL_AS_OPTIONS = [
  { value: "", label: "Sem papel de A&S" },
  ...PAPEL_AS.map((p) => ({ value: p, label: PAPEL_AS_LABEL[p] })),
];

/**
 * Modal de CRIAR/EDITAR usuário (frente "Melhorias no Menu de Usuários"). Substitui o formulário que
 * ficava no topo da tela (obrigava a rolar para cima) e a edição inline na linha (que espremia os
 * campos na tabela). §A.41: não fecha ao clicar fora, só por Cancelar/Salvar e por Escape, e não tem
 * "X" de fechar.
 *
 * ESPELHAMENTO: um seletor dos usuários existentes copia as telas/menus daquela pessoa para o alvo. No
 * backend a cópia é recortada pelo papel e pela área do alvo (a lista crua nunca trafega), então
 * escolher um Super Admin como fonte para um Comum devolve só os menus que o Comum poderia ter.
 *
 * Decisão de UX registrada: a ÁREA só aparece na CRIAÇÃO. Na edição o contrato (`PATCH`) não carrega
 * áreas, igual à edição inline de hoje, e a área continua sendo editada pelo ícone de camadas
 * (`ConfigMenusModal`), que é quem governa os menos recortados por ela. Mostrar caixas de área que não
 * salvariam seria um campo mudo.
 */
export function GestaoUsuarioModal({
  modo,
  usuario,
  usuarios,
  token,
  onClose,
  onSalvo,
}: {
  modo: "criar" | "editar";
  usuario?: UsuarioModal;
  usuarios: UsuarioModal[];
  token?: string;
  onClose: () => void;
  /** Criação devolve a senha temporária, para a página exibir o bloco copiável. Edição não gera senha. */
  onSalvo: (senhaGerada?: string) => void;
}) {
  const criando = modo === "criar";

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [papel, setPapel] = useState<Papel>(usuario?.papel ?? "COMUM");
  // Vazio de propósito na criação: o papel de A&S se concede a quem entra na frente de vagas.
  const [papelAs, setPapelAs] = useState<"" | PapelAs>(usuario?.papelAs ?? "");
  // NINGUÉM NASCE SEM ÁREA (decisão do diretor): a criação já começa com a Admissão marcada.
  const [areas, setAreas] = useState<Area[]>(criando ? ["ADM"] : (usuario?.areas ?? []));
  // Espelhamento OPCIONAL: vazio = não espelha (criação usa o padrão do papel; edição mantém as telas).
  const [espelharDe, setEspelharDe] = useState("");

  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Fonte do espelhamento: os usuários existentes, EXCLUINDO o próprio alvo na edição (espelhar alguém
   * sobre ele mesmo não faz nada e o backend recusa). A busca do `Select` acha por nome e por e-mail
   * (campo `busca`), e com mais de 8 opções ele já abre com campo de busca sozinho (§A.35).
   */
  const espelhoOptions = useMemo(() => {
    const alvoId = usuario?.id;
    const demais = usuarios
      .filter((u) => u.id !== alvoId)
      .map((u) => ({ value: u.id, label: u.nome, busca: u.email }));
    return [
      {
        value: "",
        label: criando ? "Não espelhar (usar o padrão do papel)" : "Não espelhar (manter as telas atuais)",
      },
      ...demais,
    ];
  }, [usuarios, usuario?.id, criando]);

  const nomeOk = nome.trim().length > 0;
  const emailOk = email.trim().length > 0;
  // Área só é exigida na criação (é onde ela é enviada e onde o fail-closed morderia).
  const areaOk = !criando || areas.length > 0;
  const podeSalvar = nomeOk && emailOk && areaOk && !saving;

  function alternarArea(a: Area) {
    setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setSaving(true);
    setErro(null);
    try {
      if (criando) {
        const r = await apiFetch<{ senhaTemporaria: string }>("/admin/usuarios", {
          method: "POST",
          token,
          body: {
            nome: nome.trim(),
            email: email.trim(),
            papel,
            areas,
            // Vazio não vai como string vazia: o backend espera ausente ou um dos dois papéis.
            papelAs: papelAs || undefined,
            // Só manda a fonte quando escolhida; ausente deixa o backend aplicar o padrão do papel.
            espelharDeUsuarioId: espelharDe || undefined,
          },
        });
        onSalvo(r.senhaTemporaria);
      } else if (usuario) {
        await apiFetch(`/admin/usuarios/${usuario.id}`, {
          method: "PATCH",
          token,
          body: {
            nome: nome.trim(),
            email: email.trim(),
            papel,
            // NULL LIMPA o papel; por isso o vazio vira `null` e não `undefined`, que preservaria.
            papelAs: papelAs || null,
          },
        });
        // ESPELHAR SÓ QUANDO ESCOLHIDO, e DEPOIS do PATCH: sem fonte escolhida, não se toca nos menus
        // atuais do usuário. Com fonte, é substituição deliberada (a semântica de "espelhar").
        if (espelharDe) {
          await apiFetch(`/admin/usuarios/${usuario.id}/espelhar`, {
            method: "POST",
            token,
            body: { deUsuarioId: espelharDe },
          });
        }
        onSalvo();
      }
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : criando
            ? "Erro ao criar usuário."
            : "Erro ao salvar usuário.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      className="max-w-lg"
      ariaLabel={criando ? "Criar novo usuário" : "Editar usuário"}
    >
      <form onSubmit={salvar}>
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico)] text-accent">
            <Icon name="users" className="h-4 w-4" />
          </span>
          <div>
            <div className="eyebrow !mb-0.5">Administração</div>
            <h3 className="!mb-0">{criando ? "Criar Novo Usuário" : "Editar Usuário"}</h3>
          </div>
        </div>

        <div className="grid gap-3.5">
          <div>
            <span className="ds-label">Nome</span>
            <input
              required
              autoFocus
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="ds-input"
            />
          </div>

          <div>
            <span className="ds-label">E-mail</span>
            <input
              required
              type="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ds-input"
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <span className="ds-label">Papel</span>
              <Select
                value={papel}
                onChange={(v) => setPapel(v as Papel)}
                ariaLabel="Papel do usuário"
                options={PAPEL_OPTIONS}
              />
            </div>
            {/* PAPEL DE A&S: campo independente do Papel. Um responde o que a pessoa pode fazer no
                sistema; este, que lado da vaga ela ocupa na frente de A&S. */}
            <div>
              <span className="ds-label">Papel De A&S</span>
              <Select
                value={papelAs}
                onChange={(v) => setPapelAs(v as "" | PapelAs)}
                ariaLabel="Papel de A&S do usuário"
                options={PAPEL_AS_OPTIONS}
              />
            </div>
          </div>

          {/* ÁREA só na criação: é o que impede alguém de nascer sem área e cair no fail-closed. Caixas
              e não um Select porque o modelo é LISTA (o usuário híbrido atende as duas frentes). Na
              edição a área é tratada pelo ícone de camadas, junto dos menus que ela recorta. */}
          {criando && (
            <div>
              <span className="ds-label">Área</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {AREA.map((a) => (
                  <label
                    key={a}
                    className={
                      "flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] transition " +
                      (areas.includes(a)
                        ? "bg-[var(--surface-2)] text-text"
                        : "text-dim hover:bg-[var(--surface-2)]")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={areas.includes(a)}
                      onChange={() => alternarArea(a)}
                      className="h-4 w-4 flex-none accent-[var(--accent)]"
                    />
                    {AREA_LABEL[a]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ESPELHAMENTO: copia as telas de um usuário existente para este. */}
          <div>
            <span className="ds-label">Espelhar Telas De</span>
            <Select
              value={espelharDe}
              onChange={setEspelharDe}
              ariaLabel="Espelhar telas de outro usuário"
              options={espelhoOptions}
              placeholder="Não espelhar"
            />
            <p className="mt-1 text-[12px] text-faint">
              Copia as telas e os menus daquela pessoa para este usuário, recortados pela área deste
              usuário.
            </p>
          </div>
        </div>

        {erro && (
          <p
            className="mt-4 rounded-lg border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {erro}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} className="py-2.5">
            Cancelar
          </Button>
          <Button type="submit" disabled={!podeSalvar} className="py-2.5">
            {saving ? (criando ? "Criando…" : "Salvando…") : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
