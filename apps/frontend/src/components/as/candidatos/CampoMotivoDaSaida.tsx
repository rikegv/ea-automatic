"use client";

/**
 * ─ O CAMPO DE MOTIVO DA SAÍDA: SELETOR QUANDO É CLASSIFICAÇÃO, PROSA QUANDO É PROSA ────────────
 *
 * ┌─ O DEFEITO QUE ELE CONSERTA, e ele era de RUNTIME, não de estilo ───────────────────────────┐
 * │ O backend passou a conferir o motivo contra o catálogo `motivos_descarte`                    │
 * │ (`CandidatosService.exigirMotivoDoCatalogo`) e a tela continuou mandando texto livre: TODO    │
 * │ descarte voltava 400, no individual e no lote (o lote chama a MESMA `registrarSaida`).        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUEM DECIDE O TIPO DO CAMPO É `motivoVemDoCatalogo`, DO VOCABULÁRIO COMPARTILHADO ─────────┐
 * │ NÃO existe `situacao === "DESCARTADO"` escrito aqui, e a ausência é o ponto inteiro: a lista │
 * │ (`SITUACOES_COM_MOTIVO_DE_CATALOGO`) é a MESMA que o servidor lê antes de aceitar a escrita. │
 * │ Uma segunda régua na tela seria a tela oferecendo o que a rota recusa no dia em que o        │
 * │ recorte mudar, que é exatamente o defeito de hoje visto do outro lado.                        │
 * │                                                                                              │
 * │ HOJE O RECORTE É UM (`DESCARTADO`), e os outros dois desfechos seguem em TEXTO LIVRE porque  │
 * │ a pergunta ali é prosa: "o que a pessoa disse ao desistir", "o que a admissão precisa saber". │
 * │ Amanhã ele muda numa linha do `shared-types`, e este componente acompanha sozinho.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UM COMPONENTE SÓ PARA AS DUAS TELAS que gravam saída individual (o "Mover Candidatura" da Central
 * de Candidatos e os "Candidatos Pendentes" do encerramento da vaga): duas caixas de motivo com duas
 * réguas de obrigatoriedade divergem no primeiro ajuste, e foi assim que uma delas ficou para trás
 * na primeira vez.
 *
 * §A.35: `Select` do design system, com busca ligada explicitamente. O `<select>` cru abriria o
 * dropdown do sistema operacional, que não obedece ao tema. §A.11 (sem travessão).
 * §A.6: nome de motivo de processo. Nenhum dado pessoal passa por aqui.
 */

import { motivoVemDoCatalogo, type AsMotivoDescarte } from "@ea/shared-types";
import { Select } from "@/components/ui/Select";
import { useMotivosDescarte } from "@/lib/as-motivos-descarte";

export function CampoMotivoDaSaida({
  situacao,
  valor,
  onChange,
  onEscolha,
  token,
  desabilitado = false,
  placeholder,
  alturaMinima = "min-h-[70px]",
  semRotulo = false,
  semMotivosQuePedemPretensao = false,
  opcional = false,
  rotulo = "Motivo",
}: {
  /** O desfecho escolhido. É ELE que decide se o campo é seletor ou caixa de texto. */
  situacao: string;
  valor: string;
  onChange: (valor: string) => void;
  /**
   * ─ A LINHA INTEIRA DO CATÁLOGO QUE FOI ESCOLHIDA, e não só o nome que vai no corpo ───────────
   *
   * OPCIONAL, E QUEM NÃO PRECISA NÃO PASSA: as três telas que já usavam este campo continuam sem
   * ela, e nada muda para elas. Quem precisa é o desfecho individual, por causa da PRETENSÃO
   * SALARIAL (Frente E, ponto 9): a tela só pode pedir o valor se souber, no instante da escolha,
   * se AQUELE motivo é marcado `pedePretensao`, e essa marca vem na linha, nunca no nome.
   *
   * `null` QUANDO O CAMPO É PROSA ou quando o nome escolhido não está mais na lista: quem escuta
   * trata os dois como "este desfecho não pede valor nenhum", que é a resposta certa nos dois.
   */
  onEscolha?: (motivo: AsMotivoDescarte | null) => void;
  token: string | null;
  desabilitado?: boolean;
  /** O texto de apoio do campo LIVRE. O seletor tem o dele, que fala de escolha e não de escrita. */
  placeholder: string;
  /** A altura da caixa de texto, que difere entre as duas telas que usam este campo. */
  alturaMinima?: string;
  /**
   * SEM O RÓTULO "Motivo", para quem JÁ O ESCREVEU no título da seção que envolve o campo (é o caso
   * do lote, onde a seção se chama "O Detalhe Do Motivo"). Sem esta porta, o rótulo apareceria duas
   * vezes na mesma caixa, dizendo a mesma coisa.
   */
  semRotulo?: boolean;
  /**
   * ─ ESCONDE OS MOTIVOS MARCADOS `pedePretensao`, E SÓ O LOTE PEDE ISSO ─────────────────────────
   *
   * ┌─ POR QUE O LOTE NÃO PODE OFERECÊ-LOS ───────────────────────────────────────────────────────┐
   * │ A PRETENSÃO SALARIAL É VALOR INDIVIDUAL. Perguntada UMA vez para ser aplicada a N pessoas,   │
   * │ ela gravaria dado financeiro FALSO em todas menos uma, o que é pior do que não gravar: sai   │
   * │ um número plausível, por pessoa, que ninguém disse. O servidor passou a RECUSAR esses        │
   * │ motivos no lote, e esconder aqui é a metade da tela: sem ela o consultor escolheria o motivo │
   * │ certo na cabeça dele e levaria uma recusa depois de marcar trinta linhas.                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OPCIONAL, E QUEM NÃO PASSA NÃO MUDA: as duas telas de saída INDIVIDUAL (o "Mover Candidatura" e
   * os "Candidatos Pendentes" do encerramento) continuam com a lista inteira, porque ali a pergunta
   * é feita para UMA pessoa e a resposta é dela.
   *
   * O FILTRO É PELA MARCA, NUNCA PELO NOME, pelo mesmo motivo de sempre: o catálogo é gerenciável, o
   * diretor renomeia, e comparação por nome para de funcionar em silêncio na primeira correção de
   * grafia.
   */
  semMotivosQuePedemPretensao?: boolean;
  /**
   * ─ OPCIONAL, E SÓ O ENVIO PASSA (decisão do diretor) ──────────────────────────────────────────
   *
   * Tira o asterisco de obrigatório do rótulo. O ENVIO PARA A ADMISSÃO é o único desfecho em que a
   * observação pode ir em branco: desvincular (descarte e desistência) continua exigindo o motivo,
   * que é o que o histórico mostra depois. A régua do botão mora no modal; aqui é só a apresentação.
   */
  opcional?: boolean;
  /** O rótulo do campo. O envio troca "Motivo" por "Observação"; as outras saídas seguem "Motivo". */
  rotulo?: string;
}) {
  const doCatalogo = motivoVemDoCatalogo(situacao);
  // O CATÁLOGO SÓ É PEDIDO QUANDO O CAMPO É SELETOR. Ver o comentário de `useMotivosDescarte`.
  const { motivos: todos, carregando, erro } = useMotivosDescarte(token, doCatalogo);
  const motivos = semMotivosQuePedemPretensao ? todos.filter((m) => !m.pedePretensao) : todos;

  if (!doCatalogo) {
    return (
      <label className="flex flex-col gap-1.5">
        {!semRotulo && (
          <span className="text-[12.5px] text-dim">
            {rotulo}
            {!opcional && <span className="ml-1 text-danger">*</span>}
          </span>
        )}
        <textarea
          className={`ds-input w-full ${alturaMinima} resize-y`}
          value={valor}
          disabled={desabilitado}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Motivo da saída"
          /* O TETO É O DO DTO (`@MaxLength(500)`), e ele fica no componente para as três telas
             herdarem: só o lote o declarava, então o individual deixava digitar 900 caracteres para
             o servidor recusar depois. */
          maxLength={500}
        />
      </label>
    );
  }

  const opcoes = motivos.map((m) => ({ value: m.nome, label: m.nome }));

  return (
    <label className="flex flex-col gap-1.5">
      {!semRotulo && (
        <span className="text-[12.5px] text-dim">
          {rotulo}
          {!opcional && <span className="ml-1 text-danger">*</span>}
        </span>
      )}
      <Select
        className="w-full"
        ariaLabel="Motivo do descarte"
        placeholder={carregando ? "Carregando os motivos…" : "Escolha o motivo do descarte"}
        value={valor}
        options={opcoes}
        disabled={desabilitado || carregando || opcoes.length === 0}
        /* §A.35: busca ligada, e não deixada para o automático dos 8 itens. O catálogo é do
           diretor e cresce; ligar depois seria lembrar de voltar aqui no dia em que crescer. */
        searchable
        onChange={(v) => {
          onChange(v);
          // A LINHA VAI JUNTO COM O NOME, no MESMO gesto: avisar por efeito depois faria o aviso
          // chegar um render atrasado, e quem escuta decidiria com a escolha anterior na mão.
          onEscolha?.(motivos.find((m) => m.nome === v) ?? null);
        }}
      />
      {/* ─ AS DUAS AUSÊNCIAS SÃO FATOS DIFERENTES, E CADA UMA TEM A SUA FRASE ────────────────
          "não consegui ler a lista" e "a lista está vazia" mandam a pessoa fazer coisas opostas, e
          um seletor mudo no lugar das duas a faria procurar defeito onde não há. Sem motivo ativo o
          descarte simplesmente não acontece, e quem lê precisa saber por quê e por onde resolver. */}
      {erro ? (
        <span className="text-[12px] text-danger" role="alert">
          {erro} Sem a lista não é possível registrar o descarte. Tente novamente em instantes.
        </span>
      ) : (
        !carregando &&
        opcoes.length === 0 && (
          /* A LISTA VAZIA TEM DUAS CAUSAS AQUI, e elas mandam fazer coisas diferentes: catálogo sem
             nenhum motivo (pedir o cadastro) e catálogo em que todos pedem a pretensão, logo nenhum
             serve para o lote (fazer estes descartes um a um). */
          <span className="text-[12px] text-warn">
            {semMotivosQuePedemPretensao && todos.length > 0
              ? "Nenhum motivo desta lista pode ser usado aqui: todos os cadastrados pedem a pretensão salarial, que é valor de cada pessoa. Registre estes descartes pela ficha do candidato, que é onde o valor é informado."
              : "Nenhum motivo de descarte está cadastrado. Enquanto isso, o descarte não pode ser registrado. Peça o cadastro em Motivos De Descarte, na administração."}
          </span>
        )
      )}
    </label>
  );
}
