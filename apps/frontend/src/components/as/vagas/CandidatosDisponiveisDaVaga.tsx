"use client";

/**
 * ─ A ABA "CANDIDATOS DISPONÍVEIS" DA GESTÃO DA VAGA (frente D, ponto 15) ───────────────────────
 *
 * ┌─ O QUE ELA RESOLVE ─────────────────────────────────────────────────────────────────────────┐
 * │ Para trazer gente para a vaga, o time saía da Gestão Da Vaga, ia à Central de Candidatos,     │
 * │ procurava a pessoa, alocava ou trocava a vaga dela, e voltava. Duas telas para uma pergunta   │
 * │ só ("quem eu posso colocar nesta vaga?"), e o contexto da vaga se perdia no caminho.          │
 * │ Aqui a pergunta é respondida dentro da própria vaga, e o gesto acontece ALI MESMO.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO DUAS POPULAÇÕES NA MESMA LISTA, e a coluna "Vaga Atual" é o que as distingue:
 *  (a) QUEM NÃO ESTÁ EM VAGA NENHUMA, que entra por VÍNCULO (`semCandidatura: true`, a mesma
 *      leitura do "Adicionar à vaga"); e
 *  (b) QUEM JÁ ESTÁ EM OUTRA VAGA e pode ser TRANSFERIDO para esta, mostrando de onde vem.
 *
 * NENHUM COMPONENTE DE AÇÃO NASCEU AQUI, e isso é regra e não economia: o vínculo é o
 * `AlocarCandidatoModal` (no modo de pessoa já escolhida, que é o mesmo do "Trazer De Volta", com a
 * pergunta da reentrada inteira), o vínculo em massa é o `AdicionarCandidatosEmLoteModal`, e a
 * transferência é o `TrocarVagaModal`, que até hoje só era alcançável pela Central de Candidatos.
 * Reescrever qualquer um deles daria duas réguas para a mesma escrita, e elas divergiriam no
 * primeiro ajuste.
 *
 * ┌─ A TRANSFERÊNCIA DEVOLVE A POSIÇÃO À VAGA DE ORIGEM, E A TELA DIZ ISSO ─────────────────────┐
 * │ A ocupação da vaga é DERIVADA das candidaturas, então mover a candidatura move junto a        │
 * │ posição que ela ocupava: a vaga de origem volta a ter aquela posição livre. É o efeito certo  │
 * │ e é invisível para quem está olhando só esta vaga, por isso ele é dito em palavras acima da   │
 * │ tabela, e não descoberto depois no cilindro da outra vaga.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * RBAC: A TRANSFERÊNCIA É DE QUALQUER CONSULTOR (decisão do diretor), então NADA aqui é escondido
 * por papel. Quem restringe o módulo é o menu, e quem é autoridade sobre a rota é o backend.
 *
 * §A.6: a lista traz nome, cidade/UF, origem, etapa e o nome da vaga. NENHUM CPF trafega (a busca é
 * POST e devolve `temCpf`, um booleano), e nenhuma URL desta aba carrega dado de pessoa.
 * §A.11 (sem travessão, vazio é "não informado"), §A.12/§A.20 (máscara única de tabela, larguras que
 * cabem o conteúdo, rolagem horizontal em vez de coluna esmagada), §A.24 (title case em título, aba
 * e tag; botão é ação), §A.29 (a tabela nasce ordenável pelo `useOrdenacao` que já existe).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM_LABEL,
  type AsCandidatoListItem,
  type AsCandidaturaItem,
  type VagaListItem,
} from "@ea/shared-types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import {
  avisoDeCorte,
  buscarCandidatos,
  mensagemDoErro,
  transferiveisParaVaga,
} from "@/lib/as-candidatos";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { TrocarVagaModal } from "@/components/as/candidatos/TrocarVagaModal";
import { AdicionarCandidatosEmLoteModal } from "@/components/as/vagas/AdicionarCandidatosEmLoteModal";

/**
 * UMA LINHA DA LISTA, nas duas naturezas.
 *
 * `candidatura` NULA quer dizer "não está em vaga nenhuma", e é ela que decide qual das duas ações a
 * linha oferece. Um campo `tipo` separado seria um segundo jeito de responder a mesma pergunta, e
 * dois jeitos de responder a mesma pergunta é como eles passam a discordar.
 */
interface LinhaDisponivel {
  chave: string;
  candidatoId: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  /**
   * A ORIGEM SÓ EXISTE PARA QUEM VEM DA BASE (a busca de pessoas devolve o campo). A candidatura de
   * outra vaga NÃO carrega a origem do cadastro, e inventar um valor ali faria a coluna afirmar algo
   * que ninguém leu do banco. Nulo quer dizer "não há o que dizer", e a célula não desenha nada.
   */
  origem: AsCandidatoListItem["origem"] | null;
  candidatura: AsCandidaturaItem | null;
}

function lugarDe(cidade: string | null, uf: string | null): string {
  if (!cidade) return "não informado";
  return uf ? `${cidade}/${uf}` : cidade;
}

/**
 * DE QUAL VAGA A PESSOA VEM. O nome e o código já chegam resolvidos na candidatura (é a rota dos
 * transferíveis que os resolve), então a tela não precisa de mapa de vagas nenhum.
 *
 * §A.11: célula vazia é "não informado", nunca um glifo.
 */
function rotuloDaVagaDeOrigem(c: AsCandidaturaItem): string {
  return c.vagaNome ?? c.vagaCodigo ?? "não informado";
}

export function CandidatosDisponiveisDaVaga({
  vaga,
  token,
  recebeCandidato,
  onMudou,
  onModalAberto,
}: {
  vaga: VagaListItem;
  token: string | null;
  /**
   * A VAGA AINDA RECEBE GENTE? Quem responde é o flag do catálogo de status, e a resposta chega
   * pronta do painel: perguntar de novo aqui seria uma segunda régua para o mesmo fato.
   */
  recebeCandidato: boolean;
  /** Alguém entrou ou foi transferido: o painel relê a vaga e avisa a Central de Vagas. */
  onMudou: () => void;
  /**
   * TEM UM MODAL DESTA ABA ABERTO? O painel precisa saber por causa do Escape: o `ui/Modal` escuta o
   * `document` por instância, e sem este aviso um Escape para fechar a caixa de cima levaria o painel
   * inteiro junto, com o contexto da vaga. Mesmo desenho do `acaoAberta` do painel.
   */
  onModalAberto: (aberto: boolean) => void;
}) {
  const { etapas } = useEtapas();
  const [linhas, setLinhas] = useState<LinhaDisponivel[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  /**
   * A FRASE DO CORTE DA BUSCA, quando a base tem mais gente sem vaga do que cabe numa página. Nula
   * quer dizer "não há corte", e é isso que faz o aviso aparecer só quando ele tem o que dizer.
   */
  const [corte, setCorte] = useState<string | null>(null);

  const [vincularAlvo, setVincularAlvo] = useState<{ id: string; nome: string } | null>(null);
  const [transferirAlvo, setTransferirAlvo] = useState<AsCandidaturaItem | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);

  useEffect(() => {
    onModalAberto(vincularAlvo !== null || transferirAlvo !== null || loteAberto);
  }, [vincularAlvo, transferirAlvo, loteAberto, onModalAberto]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      /*
       * DUAS LEITURAS, UMA PARA CADA POPULAÇÃO, e NENHUMA das duas é feita à mão aqui:
       *  (a) `semCandidatura: true` é a MESMA leitura do "Adicionar à vaga"; e
       *  (b) `transferiveisParaVaga` é a rota que o backend construiu para esta aba, que já exclui
       *      esta vaga, exclui quem tem processo vivo aqui (o unique parcial recusaria) e devolve
       *      só candidatura VIVA, com a vaga de origem já resolvida em nome.
       *
       * A ALTERNATIVA SERIA LER O PAINEL DE CADA VAGA E FILTRAR NA TELA, que é o que a Central de
       * Candidatos faz por outro motivo: seriam dezenas de requisições para montar aqui, com régua
       * duplicada, o recorte que a rota já entrega pronto, e a cópia é que passaria a mentir quando
       * a de verdade mudasse.
       */
      const [pagina, transferiveis] = await Promise.all([
        buscarCandidatos({ semCandidatura: true }, token),
        transferiveisParaVaga(vaga.id, token),
      ]);
      /* O CORTE DA BUSCA É DITO, NUNCA ESCONDIDO: a rota devolve uma PÁGINA, e apresentar 200 de
         1.480 como se fosse a base inteira faria a pessoa concluir que quem ela procura não existe.
         A frase é a do `avisoDeCorte`, a mesma das outras telas. */
      setCorte(avisoDeCorte(pagina));

      const semVaga: LinhaDisponivel[] = pagina.itens.map((p) => ({
        chave: `pessoa:${p.id}`,
        candidatoId: p.id,
        nome: p.nome,
        cidade: p.cidade,
        uf: p.uf,
        origem: p.origem,
        candidatura: null,
      }));

      const comVaga: LinhaDisponivel[] = transferiveis.map((c) => ({
        chave: `candidatura:${c.id}`,
        candidatoId: c.candidatoId,
        nome: c.candidatoNome,
        cidade: null,
        uf: null,
        origem: null,
        candidatura: c,
      }));

      setLinhas([...semVaga, ...comVaga]);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos disponíveis."));
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token]);

  useEffect(() => {
    if (linhas === null && !carregando && erro === null) void carregar();
  }, [linhas, carregando, erro, carregar]);

  /** O QUE A AÇÃO FAZ DEPOIS: relê ESTA lista (a pessoa saiu dela) e avisa o painel. */
  function aposAcao() {
    setVincularAlvo(null);
    setTransferirAlvo(null);
    setLinhas(null);
    onMudou();
  }

  const base = linhas ?? [];
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = useMemo(
    () => (termo ? base.filter((l) => l.nome.toLocaleLowerCase("pt-BR").includes(termo)) : base),
    [base, termo],
  );

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe, nunca escrita à mão.
  const colunas = useMemo<ColOrd<LinhaDisponivel>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (l) => l.nome },
      { chave: "lugar", tipo: "texto", valor: (l) => lugarDe(l.cidade, l.uf) },
      {
        chave: "vaga",
        tipo: "texto",
        valor: (l) => (l.candidatura ? rotuloDaVagaDeOrigem(l.candidatura) : ""),
      },
      {
        chave: "etapa",
        tipo: "texto",
        valor: (l) => (l.candidatura ? rotuloDaEtapa(l.candidatura.etapa, etapas) : ""),
      },
    ],
    [etapas],
  );
  const ord = useOrdenacao(colunas, visiveis);

  const semVagaTotal = base.filter((l) => l.candidatura === null).length;
  const transferiveisTotal = base.length - semVagaTotal;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[640px]">
          <p className="text-[12.5px] text-dim">
            {recebeCandidato
              ? "Quem pode entrar nesta vaga: gente da base sem vaga alocada e gente que está em outra vaga e pode ser transferida para cá."
              : "Esta vaga não recebe candidato novo no status atual. A lista abaixo continua consultável, e as ações ficam indisponíveis."}
          </p>
          {/* O EFEITO DA TRANSFERÊNCIA, DITO ANTES DO CLIQUE. Ver o bloco no topo do arquivo. */}
          <p className="mt-1.5 text-[12px] text-faint">
            Transferir move a mesma candidatura para cá e mantém a etapa da pessoa. A vaga de origem
            volta a ter aquela posição livre, porque a ocupação é contada pelas candidaturas.
          </p>
        </div>
        {recebeCandidato && (
          <Button
            variant="secondary"
            className="px-3.5 py-2"
            title="Traz várias pessoas da base para o funil de uma vez. Não consome posição da meta."
            onClick={() => setLoteAberto(true)}
          >
            <Icon name="layers" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
            Adicionar vários ao funil
          </Button>
        )}
      </div>

      {erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      {carregando && <p className="text-[13px] text-faint">Carregando quem está disponível.</p>}

      {!carregando && !erro && linhas !== null && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <input
              type="search"
              className="ds-input w-full max-w-[320px]"
              placeholder="Procurar pelo nome"
              aria-label="Procurar candidato pelo nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <span className="text-[12px] text-faint">
              {visiveis.length} à vista de {base.length}. {semVagaTotal} sem vaga alocada,{" "}
              {transferiveisTotal} em outra vaga.
            </span>
          </div>

          {/* O CORTE DA BUSCA, dito antes da tabela: sem ele, uma base maior que a página faria a
              lista parecer completa, e quem não achasse a pessoa concluiria que ela não existe. */}
          {corte && <p className="mb-3 text-[12px] text-warn">{corte}</p>}

          <div className="ea-scroll overflow-x-auto">
            {/* §A.12/§A.20: máscara única, títulos centralizados, e a tabela ROLA em vez de espremer
                o nome da pessoa e o da vaga de origem, que são os dois textos longos da lista. */}
            <table className="ds-table min-w-[860px]">
              <thead>
                <tr>
                  <ColunaOrdenavel as="th" ord={ord} chave="nome" className="text-center">
                    Candidato
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    as="th"
                    ord={ord}
                    chave="lugar"
                    className="w-[170px] text-center"
                  >
                    Cidade
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="text-center">
                    Vaga Atual
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    as="th"
                    ord={ord}
                    chave="etapa"
                    className="w-[170px] text-center"
                  >
                    Etapa
                  </ColunaOrdenavel>
                  <th className="w-[150px] text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ord.itens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-faint">
                      {termo
                        ? "Nenhum candidato disponível com esse nome. Ajuste a busca."
                        : "Ninguém está disponível agora: a base não tem pessoa sem vaga, e as outras vagas não têm candidatura em andamento para transferir."}
                    </td>
                  </tr>
                ) : (
                  ord.itens.map((l) => (
                    <tr key={l.chave}>
                      <td>
                        <span className="text-[13px] font-semibold text-text">{l.nome}</span>
                        {l.origem !== null && (
                          <span className="block text-[11.5px] text-faint">
                            {AS_CANDIDATO_ORIGEM_LABEL[l.origem]}
                          </span>
                        )}
                      </td>
                      <td className="text-center text-[12.5px] text-dim">
                        {lugarDe(l.cidade, l.uf)}
                      </td>
                      <td>
                        {l.candidatura ? (
                          <span className="text-[12.5px] text-text">
                            {rotuloDaVagaDeOrigem(l.candidatura)}
                          </span>
                        ) : (
                          // §A.24: é TAG, então title case. Ela é o que separa as duas populações
                          // da lista, e por isso não vira um traço nem um texto apagado.
                          <span className="inline-flex justify-center">
                            <StatusPill tone="nt" label="Sem Vaga Alocada" />
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {l.candidatura ? (
                          <span className="inline-flex justify-center">
                            <StatusPill
                              tone={tomDaEtapa(l.candidatura.etapa, etapas)}
                              label={rotuloDaEtapa(l.candidatura.etapa, etapas)}
                            />
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-faint">não informado</span>
                        )}
                      </td>
                      <td className="text-center">
                        {/* O GESTO NÃO É ESCONDIDO POR PAPEL (decisão do diretor): transferir é de
                            qualquer consultor. O que o desabilita é o STATUS DA VAGA, que é o mesmo
                            motivo que já barra o "Adicionar à vaga". */}
                        {l.candidatura ? (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-[12.5px]"
                            disabled={!recebeCandidato}
                            title={
                              recebeCandidato
                                ? "Transferir esta candidatura para a vaga atual, mantendo a etapa"
                                : "Esta vaga não recebe candidato novo no status atual"
                            }
                            onClick={() => setTransferirAlvo(l.candidatura)}
                          >
                            Transferir
                          </Button>
                        ) : (
                          <Button
                            className="px-3 py-1.5 text-[12.5px]"
                            disabled={!recebeCandidato}
                            title={
                              recebeCandidato
                                ? "Vincular esta pessoa à vaga atual, na primeira etapa do funil"
                                : "Esta vaga não recebe candidato novo no status atual"
                            }
                            onClick={() => setVincularAlvo({ id: l.candidatoId, nome: l.nome })}
                          >
                            Vincular
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─ AS AÇÕES: OS MODAIS QUE JÁ EXISTEM, COM ESTA VAGA JÁ ESCOLHIDA ──────────────────────
          O vínculo vai pelo modo de PESSOA FIXA do `AlocarCandidatoModal`, que é o mesmo caminho do
          "Trazer De Volta": ele carrega a pergunta da reentrada (quando a pessoa já teve processo
          encerrado NESTA vaga) inteira, e é justamente ela que um formulário novo aqui perderia. */}
      {vincularAlvo && (
        <AlocarCandidatoModal
          vagasAbertas={[vaga]}
          vagaSugerida={vaga.id}
          pessoaFixa={vincularAlvo}
          token={token}
          onClose={() => setVincularAlvo(null)}
          onAlocado={aposAcao}
        />
      )}

      {transferirAlvo && (
        <TrocarVagaModal
          candidatura={transferirAlvo}
          /* SÓ ESTA VAGA COMO DESTINO: a aba é da vaga, e oferecer as outras aqui seria, de dentro
             da gestão de uma vaga, mover alguém para uma terceira. */
          vagasAbertas={[vaga]}
          token={token}
          onClose={() => setTransferirAlvo(null)}
          onTrocado={aposAcao}
        />
      )}

      {loteAberto && (
        <AdicionarCandidatosEmLoteModal
          vaga={vaga}
          token={token}
          onClose={() => setLoteAberto(false)}
          /* NÃO FECHA SOZINHO: quem adicionou trinta pessoas costuma adicionar mais, e o resultado
             do lote é lido por cima desta mesma caixa. */
          onFeito={aposAcao}
        />
      )}
    </>
  );
}
