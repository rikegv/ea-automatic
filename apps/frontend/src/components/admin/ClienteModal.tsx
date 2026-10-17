"use client";

import { useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { TIPO_MARCACAO, TIPO_MARCACAO_LABEL, type TipoMarcacao } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { Cliente, VinculoOpcao } from "./cliente-tipos";

/** Rótulos de periodicidade, os mesmos que a tela de Benefícios e a leitura da lista usam. */
const OPCOES_PERIODICIDADE = [
  { valor: "CADA_5_DIAS", rotulo: "a cada 5 dias" },
  { valor: "CADA_15_DIAS", rotulo: "a cada 15 dias" },
  { valor: "MENSAL", rotulo: "uma vez por mês" },
];

/** tipo_servico do vínculo → rótulo curto, para o aviso de "contrato adicionado". §A.24 title case. */
const TIPO_SERVICO_ROTULO: Record<string, string> = {
  TEMPORARIO: "Temporário",
  TERCEIRO: "Terceirizado",
  ESTAGIO: "Estágio",
  INTERNO: "Interno",
  FOPAG: "Fopag",
  APRENDIZ: "Jovem Aprendiz",
};

interface CatalogoItem {
  id: number;
  rotulo: string;
  ativo: boolean;
}

/** Estado do formulário: tudo string (o input devolve string); converte no envio. */
interface FormState {
  codCliente: string;
  cnpj: string;
  razaoSocial: string;
  nomeOperacao: string;
  empresaGrupo: string;
  regiao: string;
  descricaoRegiao: string;
  beneficiosPadrao: string;
  escalaPadrao: string;
  enderecoPadrao: string;
  periodicidadeBeneficio: string;
  diaPagamentoBeneficio: string;
  diasPrimeiroCredito: string;
  tipoMarcacao: TipoMarcacao;
  segmentoId: string;
  comercialId: string;
}

function formDoCliente(c: Cliente | null): FormState {
  return {
    codCliente: c?.codCliente ?? "",
    cnpj: c?.cnpj ?? "",
    razaoSocial: c?.razaoSocial ?? "",
    nomeOperacao: c?.nomeOperacao ?? "",
    empresaGrupo: c?.empresaGrupo ?? "",
    regiao: c?.regiao ?? "",
    descricaoRegiao: c?.descricaoRegiao ?? "",
    beneficiosPadrao: c?.beneficiosPadrao ?? "",
    escalaPadrao: c?.escalaPadrao ?? "",
    enderecoPadrao: c?.enderecoPadrao ?? "",
    periodicidadeBeneficio: c?.periodicidadeBeneficio ?? "",
    diaPagamentoBeneficio: c?.diaPagamentoBeneficio?.toString() ?? "",
    diasPrimeiroCredito: c?.diasPrimeiroCredito?.toString() ?? "",
    tipoMarcacao: c?.tipoMarcacao ?? ("APLICATIVO" as TipoMarcacao),
    segmentoId: c?.segmentoId?.toString() ?? "",
    comercialId: c?.comercialId?.toString() ?? "",
  };
}

/**
 * MODAL DE CADASTRO E EDIÇÃO DE CLIENTE (OST do modal completo, 17/10/2026).
 *
 * Substitui o formulário inline que vivia no topo da tela e obrigava a rolar para cima e, mesmo
 * assim, não abria o CRUD inteiro: os atributos de padrão do cliente (empresa do grupo, região,
 * benefícios/escala/endereço padrão) não eram editáveis em lugar nenhum da tela. Aqui estão TODOS.
 *
 * §A.41: modal de PREENCHIMENTO, fecha por Cancelar ou Salvar, nunca ao clicar fora (o `ui/Modal` já
 * garante). §A.35: todo seletor é o `Select` do design system. §A.11: sem travessão. §A.24: títulos
 * em title case. §A.6: o CNPJ só trafega no corpo, nunca em log, e o nome do comercial não sai daqui.
 */
export function ClienteModal({
  cliente,
  opcoesVinculo,
  segmentos,
  segmentosErro,
  comerciais,
  comerciaisErro,
  token,
  onClose,
  onSalvo,
}: {
  /** null = cadastrar; preenchido = editar. */
  cliente: Cliente | null;
  opcoesVinculo: VinculoOpcao[];
  segmentos: CatalogoItem[];
  segmentosErro: string | null;
  comerciais: CatalogoItem[];
  comerciaisErro: string | null;
  token: string | null;
  onClose: () => void;
  /** Sucesso: fecha e recarrega a lista. O aviso (quando há) é exibido pela página. */
  onSalvo: (aviso?: string) => void;
}) {
  const editando = cliente !== null;
  const [form, setForm] = useState<FormState>(() => formDoCliente(cliente));
  const [vinculoSel, setVinculoSel] = useState<string>(cliente?.vinculoOpcaoId ?? "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const vinculoOriginal = cliente?.vinculoOpcaoId ?? "";

  /** O inativo escolhido continua na lista (senão salvar APAGA o dado, armadilha documentada). */
  const opcoesSegmento = useMemo(
    () => [
      { value: "", label: "não informado" },
      ...segmentos
        .filter((s) => s.ativo || String(s.id) === form.segmentoId)
        .map((s) => ({ value: String(s.id), label: s.ativo ? s.rotulo : `${s.rotulo} (inativo)` })),
    ],
    [segmentos, form.segmentoId],
  );
  const opcoesComercial = useMemo(
    () => [
      { value: "", label: "não informado" },
      ...comerciais
        .filter((c) => c.ativo || String(c.id) === form.comercialId)
        .map((c) => ({ value: String(c.id), label: c.ativo ? c.rotulo : `${c.rotulo} (inativo)` })),
    ],
    [comerciais, form.comercialId],
  );

  const set = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  /** Texto vazio vira null (LIMPAR); texto preenchido grava. §A.11: "não informado" na ausência. */
  const limpavel = (s: string): string | null => (s.trim() === "" ? null : s.trim());

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    try {
      if (editando && cliente) {
        // EDITAR: o código (chave) não muda. Envia o CRUD completo; `null` nos campos opcionais é o
        // "limpar". segmentoId/comercialId também, pela mesma régua (o DTO conhece os dois campos).
        await apiFetch(`/admin/clientes/${encodeURIComponent(cliente.codCliente)}`, {
          method: "PATCH",
          token,
          body: {
            razaoSocial: form.razaoSocial,
            cnpj: limpavel(form.cnpj),
            nomeOperacao: limpavel(form.nomeOperacao),
            empresaGrupo: limpavel(form.empresaGrupo),
            regiao: limpavel(form.regiao),
            descricaoRegiao: limpavel(form.descricaoRegiao),
            beneficiosPadrao: limpavel(form.beneficiosPadrao),
            escalaPadrao: limpavel(form.escalaPadrao),
            enderecoPadrao: limpavel(form.enderecoPadrao),
            tipoMarcacao: form.tipoMarcacao,
            periodicidadeBeneficio: form.periodicidadeBeneficio || null,
            diaPagamentoBeneficio:
              form.diaPagamentoBeneficio === "" ? null : Number(form.diaPagamentoBeneficio),
            diasPrimeiroCredito:
              form.diasPrimeiroCredito === "" ? null : Number(form.diasPrimeiroCredito),
            segmentoId: form.segmentoId === "" ? null : Number(form.segmentoId),
            comercialId: form.comercialId === "" ? null : Number(form.comercialId),
          },
        });
        // TROCA/ADIÇÃO de contrato (vínculo) só quando o usuário mudou a opção. O backend faz o
        // upsert por tipo (contrato de outro tipo soma; do mesmo tipo atualiza aquele vínculo).
        if (vinculoSel && vinculoSel !== vinculoOriginal) {
          await apiFetch(`/admin/clientes/${encodeURIComponent(cliente.codCliente)}/vinculo`, {
            method: "PATCH",
            token,
            body: { opcaoId: vinculoSel },
          });
        }
        onSalvo();
        return;
      }

      // CADASTRAR. O contrato escolhido vai no corpo: se o código já existir com OUTRO contrato, o
      // backend ADICIONA o vínculo ao cliente existente em vez de recusar (decisão do diretor).
      const res = await apiFetch<{
        codCliente: string;
        criado: boolean;
        contratoAdicionado: boolean;
        tipoServico: string | null;
      }>("/admin/clientes", {
        method: "POST",
        token,
        body: {
          codCliente: form.codCliente.trim(),
          razaoSocial: form.razaoSocial,
          cnpj: limpavel(form.cnpj),
          nomeOperacao: limpavel(form.nomeOperacao),
          empresaGrupo: limpavel(form.empresaGrupo),
          regiao: limpavel(form.regiao),
          descricaoRegiao: limpavel(form.descricaoRegiao),
          beneficiosPadrao: limpavel(form.beneficiosPadrao),
          escalaPadrao: limpavel(form.escalaPadrao),
          enderecoPadrao: limpavel(form.enderecoPadrao),
          segmentoId: form.segmentoId === "" ? null : Number(form.segmentoId),
          comercialId: form.comercialId === "" ? null : Number(form.comercialId),
          vinculoOpcaoId: vinculoSel || undefined,
        },
      });
      const aviso =
        res?.contratoAdicionado && res.tipoServico
          ? `O cliente ${res.codCliente} já existia. O contrato ${TIPO_SERVICO_ROTULO[res.tipoServico] ?? res.tipoServico} foi adicionado a ele.`
          : undefined;
      onSalvo(aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel={editando ? "Editar cliente" : "Cadastrar cliente"}
      className="max-w-[820px] p-6"
    >
      <form onSubmit={salvar}>
        <div className="mb-5">
          <div className="eyebrow !mb-1">Clientes</div>
          <h2 className="font-display text-xl font-bold">
            {editando ? "Editar Cliente" : "Cadastrar Cliente"}
          </h2>
          <p className="mt-1 text-[13px] text-dim">
            {editando
              ? "Todos os dados do cliente em um lugar só. O código é a chave e não muda."
              : "Cadastre o cliente. O contrato define o vínculo com a empresa empregadora do Grupo Soulan."}
          </p>
        </div>

        {erro && (
          <p
            className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {erro}
          </p>
        )}

        {/* IDENTIFICAÇÃO */}
        <Secao titulo="Identificação">
          <Campo rotulo="Código do cliente" className="sm:col-span-2">
            <input
              required
              value={form.codCliente}
              onChange={(e) => set("codCliente", e.target.value)}
              disabled={editando}
              placeholder="Cód. cliente"
              className="ds-input disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Campo>
          <Campo rotulo="Razão social" className="sm:col-span-4">
            <input
              required
              value={form.razaoSocial}
              onChange={(e) => set("razaoSocial", e.target.value)}
              placeholder="Razão social"
              className="ds-input"
            />
          </Campo>
          <Campo rotulo="CNPJ" className="sm:col-span-3">
            <input
              value={form.cnpj}
              onChange={(e) => set("cnpj", e.target.value)}
              placeholder="não informado"
              className="ds-input"
            />
          </Campo>
          <Campo rotulo="Nome da operação" className="sm:col-span-3">
            <input
              value={form.nomeOperacao}
              onChange={(e) => set("nomeOperacao", e.target.value)}
              placeholder="não informado"
              className="ds-input"
            />
          </Campo>
        </Secao>

        {/* CONTRATO (VÍNCULO) */}
        <Secao titulo="Contrato">
          <Campo rotulo="Vínculo (empresa Soulan / tipo)" className="sm:col-span-6">
            <Select
              value={vinculoSel}
              onChange={setVinculoSel}
              ariaLabel="Vínculo do cliente com a empresa empregadora"
              placeholder="Selecione o contrato"
              options={opcoesVinculo.map((o) => ({ value: o.id, label: o.label }))}
            />
            <span className="mt-1 block text-[12px] text-faint">
              {editando
                ? "Trocar para um contrato de outro tipo soma o contrato ao cliente; do mesmo tipo atualiza o vínculo."
                : "Se o código já existir com outro contrato, o contrato é somado ao cliente, sem duplicar o código."}
            </span>
          </Campo>
        </Secao>

        {/* CLASSIFICAÇÃO */}
        <Secao titulo="Classificação">
          <Campo rotulo="Segmento" className="sm:col-span-2">
            <Select
              value={form.segmentoId}
              onChange={(v) => set("segmentoId", v)}
              ariaLabel="Segmento do cliente"
              placeholder="não informado"
              options={opcoesSegmento}
            />
            <span className={`mt-1 block text-[12px] ${segmentosErro ? "text-danger" : "text-faint"}`}>
              {segmentosErro ?? "O ramo do cliente. Opcional."}
            </span>
          </Campo>
          <Campo rotulo="Comercial" className="sm:col-span-4">
            <Select
              value={form.comercialId}
              onChange={(v) => set("comercialId", v)}
              ariaLabel="Comercial responsável pelo cliente"
              placeholder="não informado"
              options={opcoesComercial}
            />
            <span className={`mt-1 block text-[12px] ${comerciaisErro ? "text-danger" : "text-faint"}`}>
              {comerciaisErro ?? "Quem do comercial atende este cliente. Opcional."}
            </span>
          </Campo>
        </Secao>

        {/* PADRÕES DO CLIENTE (pré-preenchem o wizard) */}
        <Secao titulo="Padrões Do Cliente">
          <Campo rotulo="Empresa do grupo" className="sm:col-span-3">
            <input
              value={form.empresaGrupo}
              onChange={(e) => set("empresaGrupo", e.target.value)}
              placeholder="não informado"
              className="ds-input"
            />
          </Campo>
          <Campo rotulo="Região" className="sm:col-span-3">
            <input
              value={form.regiao}
              onChange={(e) => set("regiao", e.target.value)}
              placeholder="não informado"
              className="ds-input"
            />
          </Campo>
          <Campo rotulo="Descrição da região" className="sm:col-span-6">
            <input
              value={form.descricaoRegiao}
              onChange={(e) => set("descricaoRegiao", e.target.value)}
              placeholder="não informado"
              className="ds-input"
            />
          </Campo>
          <Campo rotulo="Benefícios padrão" className="sm:col-span-6">
            <textarea
              value={form.beneficiosPadrao}
              onChange={(e) => set("beneficiosPadrao", e.target.value)}
              placeholder="não informado"
              rows={2}
              className="ds-input min-h-[64px] resize-y"
            />
          </Campo>
          <Campo rotulo="Escala padrão" className="sm:col-span-3">
            <textarea
              value={form.escalaPadrao}
              onChange={(e) => set("escalaPadrao", e.target.value)}
              placeholder="não informado"
              rows={2}
              className="ds-input min-h-[64px] resize-y"
            />
          </Campo>
          <Campo rotulo="Endereço padrão" className="sm:col-span-3">
            <textarea
              value={form.enderecoPadrao}
              onChange={(e) => set("enderecoPadrao", e.target.value)}
              placeholder="não informado"
              rows={2}
              className="ds-input min-h-[64px] resize-y"
            />
          </Campo>
        </Secao>

        {/* IFRACTAL e PAGAMENTO DO BENEFÍCIO: só na EDIÇÃO. São regras que se definem para um cliente
            que JÁ existe (o tipo de marcação nasce no default APLICATIVO e o benefício é "regra que
            se define depois"), e o cadastro não as persiste. Mostrá-las no cadastro seria oferecer
            campo que o salvar ignora. Editáveis logo após criar o cliente. */}
        {editando && (
          <Secao titulo="iFractal">
            <Campo rotulo="Tipo de marcação" className="sm:col-span-3">
              <Select
                value={form.tipoMarcacao}
                onChange={(v) => set("tipoMarcacao", v as TipoMarcacao)}
                ariaLabel="Tipo de marcação"
                options={TIPO_MARCACAO.map((t) => ({ value: t, label: TIPO_MARCACAO_LABEL[t] }))}
              />
              <span className="mt-1 block text-[12px] text-faint">
                Herdado por todas as admissões deste cliente no iFractal.
              </span>
            </Campo>
          </Secao>
        )}

        {editando && (
          <Secao titulo="Pagamento Do Benefício">
            <Campo rotulo="Periodicidade" className="sm:col-span-2">
              <Select
                value={form.periodicidadeBeneficio}
                onChange={(v) => set("periodicidadeBeneficio", v)}
                ariaLabel="Periodicidade do benefício"
                placeholder="não informado"
                options={[
                  { value: "", label: "não informado" },
                  ...OPCOES_PERIODICIDADE.map((o) => ({ value: o.valor, label: o.rotulo })),
                ]}
              />
            </Campo>
            <Campo rotulo="Dia do pagamento" className="sm:col-span-2">
              <input
                type="number"
                min={1}
                max={31}
                value={form.diaPagamentoBeneficio}
                onChange={(e) => set("diaPagamentoBeneficio", e.target.value)}
                placeholder="não informado"
                className="ds-input"
              />
            </Campo>
            <Campo rotulo="Dias até o 1º crédito" className="sm:col-span-2">
              <input
                type="number"
                min={0}
                max={60}
                value={form.diasPrimeiroCredito}
                onChange={(e) => set("diasPrimeiroCredito", e.target.value)}
                title="Dias corridos contando o próprio dia da admissão. Zero credita no mesmo dia."
                placeholder="não informado"
                className="ds-input"
              />
            </Campo>
          </Secao>
        )}

        {/* RODAPÉ: §A.41 fecha por Cancelar ou Salvar, nunca ao clicar fora. */}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar cliente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Seção do modal: título em title case (§A.24) + grade de 6 colunas em telas largas. */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="ds-label !mb-3 !text-[13px] !font-semibold !text-text">{titulo}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">{children}</div>
    </section>
  );
}

/** Um campo rotulado dentro da grade da seção. */
function Campo({
  rotulo,
  className,
  children,
}: {
  rotulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="ds-label">{rotulo}</span>
      {children}
    </label>
  );
}
