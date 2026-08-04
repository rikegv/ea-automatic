import type { Sql } from "postgres";
import { calcSinalizadorPreenchimento } from "../domain/admissao";
import { FRENTES_AO_NASCER } from "../domain/frentes";
import { STATUS_INICIAL_FRENTE } from "../domain/admissao";
import { derivarCpfProvisorio, ehCpfProvisorio } from "../domain/identidade-provisoria";
import type { FarolGlobal } from "@ea/shared-types";

/**
 * Gravação e reconciliação de DECLÍNIO COM IDENTIDADE PROVISÓRIA (Opção 1a, decisão do diretor).
 *
 * SUB-CAMINHO 1a: grava candidato, admissão, dados de vaga, as duas frentes e os documentos da régua
 * por SQL direto, pulando o `isValidCpf`. O `AdmissoesService.create` NÃO é tocado (§A.26): ele é o
 * caminho de toda admissão VIVA e não vale abrir exceção nele para registro de histórico encerrado.
 *
 * O que este arquivo reproduz do `create`, de propósito, para o registro não nascer diferente dos
 * outros: candidato preservado por CPF, sinalizador calculado pela MESMA função de domínio, frentes
 * AUDITORIA e EXAME nascendo juntas (regra 1) e documentos da régua em PENDENTE. O que ele NÃO faz é
 * validar CPF, que é justamente o motivo de existir.
 *
 * A §A.16 Regra 2 carimba as frentes de declínio depois, no fecho da carga, como faz para todos os
 * outros declínios: Auditoria `DECLINOU`, Exame `CANCELADO`, `concluida = false`, sem criar Cadastro.
 *
 * §A.6: nada de CPF ou nome sai daqui em log; a função devolve contagem e o chamador escreve os
 * relatórios nominais em arquivo restrito.
 */

export type LinhaProvisoria = {
  linha: string;
  nome: string;
  email?: string;
  telefone?: string;
  dataNascimento?: string;
  codCliente: string;
  cargoId: string;
  dataAdmissao?: string;
  tipoContrato?: string;
  matricula?: string;
  farol: FarolGlobal;
  salario?: string;
  beneficios?: string;
  escala?: string;
  centroCusto?: string;
  departamento?: string;
  gestorBp?: string;
  motivo?: string;
  tempoContrato?: string;
  endereco?: string;
};

const nn = (v: string | undefined) => (v && v.trim() !== "" ? v : null);

/**
 * Cria o declínio com identidade provisória. Devolve o identificador derivado e o id da admissão.
 *
 * IDEMPOTENTE por construção: o identificador vem de nome + cliente + data, então repetir a carga
 * cai no mesmo `cpf` e o chamador reconhece a admissão pela dedup normal antes de chegar aqui.
 */
export async function inserirDeclinioProvisorio(
  sql: Sql,
  r: LinhaProvisoria,
): Promise<{ cpfProvisorio: string; admissaoId: string }> {
  const cpfProvisorio = derivarCpfProvisorio(r.nome, r.codCliente, r.dataAdmissao);

  const sinalizador = calcSinalizadorPreenchimento({
    candidato: { nome: r.nome, cpf: cpfProvisorio },
    codCliente: r.codCliente,
    cargoId: r.cargoId,
    dataAdmissao: r.dataAdmissao,
    tipoContrato: r.tipoContrato,
    vagaFolha: {
      salario: r.salario,
      beneficios: r.beneficios,
      escala: r.escala,
      centroCusto: r.centroCusto,
      gestorBp: r.gestorBp,
    },
    temBeneficioEstruturado: false,
  });

  const admissaoId = await sql.begin(async (tx) => {
    // Candidato: preserva o existente (regra 6), igual ao `create`.
    await tx`
      INSERT INTO candidatos (cpf, nome, email, telefone, data_nascimento)
      VALUES (${cpfProvisorio}, ${r.nome}, ${nn(r.email)}, ${nn(r.telefone)},
              ${nn(r.dataNascimento)}::date)
      ON CONFLICT (cpf) DO NOTHING`;

    const [adm] = await tx`
      INSERT INTO admissoes (candidato_cpf, cod_cliente, cargo_id, tipo_contrato, data_admissao,
                             sinalizador_preenchimento, origem, farol_global, matricula)
      VALUES (${cpfProvisorio}, ${r.codCliente}, ${r.cargoId}::uuid, ${nn(r.tipoContrato)},
              ${nn(r.dataAdmissao)}::date, ${sinalizador}, 'MANUAL', ${r.farol}, ${nn(r.matricula)})
      RETURNING id`;

    await tx`
      INSERT INTO dados_vaga_folha (admissao_id, salario, beneficios, escala, centro_custo,
                                    departamento, gestor_bp, motivo, tempo_contrato, endereco)
      VALUES (${adm.id}, ${nn(r.salario)}::numeric, ${nn(r.beneficios)}, ${nn(r.escala)},
              ${nn(r.centroCusto)}, ${nn(r.departamento)}, ${nn(r.gestorBp)}, ${nn(r.motivo)},
              ${nn(r.tempoContrato)}, ${nn(r.endereco)})`;

    // Nascimento paralelo (regra 1 / F12). A §A.16 Regra 2 carimba o estado de declínio no fecho.
    for (const tipo of FRENTES_AO_NASCER) {
      await tx`
        INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio)
        VALUES (${adm.id}, ${tipo}, ${STATUS_INICIAL_FRENTE[tipo]}, false, now())
        ON CONFLICT (admissao_id, tipo) DO NOTHING`;
    }

    // Documentos da régua do par, em PENDENTE. A §A.16 Regra 2 os mantém no estado real: quem
    // declinou nunca entregou documento, e isso não vira pendência em lugar nenhum porque o filtro
    // de farol já tira o declínio de toda fila e todo KPI.
    await tx`
      INSERT INTO documentos_admissao (admissao_id, tipo_documento_id, estado)
      SELECT ${adm.id}, rd.tipo_documento_id, 'PENDENTE'
      FROM regua_documental rd
      WHERE rd.cod_cliente = ${r.codCliente} AND rd.cargo_id = ${r.cargoId}::uuid
        AND rd.exigencia IN ('OBRIGATORIO', 'FACULTATIVO')`;

    return adm.id as string;
  });

  return { cpfProvisorio, admissaoId };
}

/**
 * RECONCILIAÇÃO (proteção b): o CPF real apareceu, troca o provisório sem duplicar.
 *
 * Custa três comandos numa tabela só porque `admissoes.candidato_cpf` é a ÚNICA chave estrangeira
 * que aponta para `candidatos`. Conferido no banco.
 *
 * A trilha (`candidato_alteracoes_log`) é chaveada por `admissao_id`, não por CPF, então ela
 * sobrevive à troca. §A.6, minimização: grava o provisório (que não é dado pessoal) e uma marca de
 * que o real entrou, NUNCA o CPF real em texto de trilha. O CPF real já vive, legitimamente, na sua
 * coluna própria.
 *
 * Devolve quantas admissões foram repontadas. Zero significa que não havia provisório para trocar.
 */
export async function reconciliarProvisorio(
  sql: Sql,
  p: {
    cpfProvisorio: string;
    cpfReal: string;
    nome: string;
    email?: string;
    telefone?: string;
    dataNascimento?: string;
    autorId?: string | null;
  },
): Promise<number> {
  if (!ehCpfProvisorio(p.cpfProvisorio)) {
    throw new Error("reconciliarProvisorio: origem não é uma identidade provisória");
  }
  if (ehCpfProvisorio(p.cpfReal)) {
    throw new Error("reconciliarProvisorio: destino não pode ser outra identidade provisória");
  }

  return await sql.begin(async (tx) => {
    // 1. o candidato real passa a existir (preservando o que já houver dele).
    await tx`
      INSERT INTO candidatos (cpf, nome, email, telefone, data_nascimento)
      VALUES (${p.cpfReal}, ${p.nome}, ${nn(p.email)}, ${nn(p.telefone)},
              ${nn(p.dataNascimento)}::date)
      ON CONFLICT (cpf) DO NOTHING`;

    // 2. as admissões do provisório passam a apontar para ele.
    const movidas = await tx`
      UPDATE admissoes SET candidato_cpf = ${p.cpfReal}, atualizado_em = now()
      WHERE candidato_cpf = ${p.cpfProvisorio}
      RETURNING id`;

    // 3. o provisório deixa de existir. Só depois do passo 2, senão a chave estrangeira barra.
    await tx`DELETE FROM candidatos WHERE cpf = ${p.cpfProvisorio}`;

    for (const m of movidas) {
      await tx`
        INSERT INTO candidato_alteracoes_log (admissao_id, campo, valor_anterior, valor_novo, autor_id)
        VALUES (${m.id}, 'cpf', ${p.cpfProvisorio}, 'CPF real reconciliado', ${p.autorId ?? null})`;
    }

    return movidas.length;
  });
}
