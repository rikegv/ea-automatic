"use client";

/**
 * CONTROLE GERENCIAL, visão ALTO VOLUME: a ANÁLISE do projeto, a tela que responde "como está indo".
 *
 * ONDE ELA MORA, e por quê. Nasceu na onda 4 como `/admin/alto-volume/analise`, dentro do Menu
 * Gerencial, junto do cadastro. O diretor separou as duas coisas em definitivo: CADASTRAR projeto,
 * vagas e vínculos é gestão e fica no Menu Gerencial; ANALISAR é dashboard, e dashboard mora no
 * Controle Gerencial (DESIGN-SYSTEM.md). Então a tela virou PÁGINA FILHA do painel, alcançada pela
 * pílula "Alto Volume" do alternador, e o conteúdo veio inteiro da onda 4, sem refazer nada.
 *
 * PÁGINA FILHA, e não modo por dentro do painel: o Controle Gerencial é tela validada, travada em
 * `calc(100vh - 68px)` sem rolagem, com KPIs, seis tabelas e dois gráficos dividindo a altura por
 * proporção. Dar dois modos à raiz daquele arquivo seria mexer no que já funciona para ganhar nada:
 * como rota irmã, o painel continua byte a byte o que era, e quem diz qual pílula acende é a rota.
 *
 * A pergunta que a frente inteira existe para responder: das 57 vagas de Atendente, quantas já
 * fecharam, quantas faltam e quanto tempo resta. A esteira conduz cada admissão e o Gerenciador lista
 * todas; nenhum dos dois sabe responder por PROJETO, porque o projeto só passou a existir como
 * recorte nesta frente.
 *
 * §A.26: a tela é LEITURA PARALELA. Um GET agregado (`/analise`), nenhuma escrita, nenhum botão que
 * mude estado. Quem mexe no vínculo é a tela de cadastro (onda 3), que fica a um link daqui.
 *
 * TROCAR DE CLIENTE E DE PROJETO RECARREGA, no molde do Controle Gerencial: o painel inteiro vem do
 * mesmo GET, então os números nunca são de dois projetos ao mesmo tempo.
 *
 * O GRÁFICO É DESENHADO NA MÃO, sem biblioteca nova (decisão de desenho): são barras arredondadas de
 * largura percentual, e a cor sai dos tokens do tema, então acompanha claro e escuro sem código de
 * tema próprio. O cilindro que ocupava este lugar foi trocado por três barras por cargo a pedido do
 * diretor: o cilindro dava a sensação, as barras dão os três números lado a lado, que é o que o time
 * compara. As três dizem o total de vagas do projeto, o total já na esteira e quanto falta para
 * completar.
 *
 * "NA ESTEIRA" É O TERMO ÚNICO desta tela para quem já foi vinculado ao projeto (decisão do diretor).
 * Antes convivia com "no projeto", e dois nomes para a mesma coluna é como um painel começa a ser
 * lido errado. Vale nos baldes, nas barras e na tabela.
 *
 * §A.12/§A.20 na tabela, §A.24 title case em título e tag, §A.11 sem travessão.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { PessoasDaLojaModal } from "@/components/alto-volume/PessoasDaLojaModal";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavDiretoria } from "@/components/diretoria/NavDiretoria";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Projeto {
  id: string;
  codCliente: string;
  clienteRazaoSocial: string;
  clienteNomeOperacao: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
}

interface LinhaCargo {
  cargoId: string | null;
  cargoNome: string;
  vagas: number;
  vinculadas: number;
  concluidas: number;
  cadastradas: number;
  emAndamento: number;
  pausadas: number;
  declinios: number;
  emBanco: number;
  faltam: number;
  percentual: number;
}

interface LinhaGrupo {
  id: string;
  rotulo: string;
  dataEntrada: string;
  vagas: number;
  vinculadas: number;
  concluidas: number;
  atrasadas: number;
  percentual: number;
  entrou: boolean;
}

/**
 * LOJAS / UNIDADES: uma linha por LOJA CADASTRADA, com a quantidade de vagas do projeto nela.
 *
 * O RÓTULO E O DADO AGORA CONCORDAM (etapa 4, 01/09/2026), e essa é a mudança. Até aqui o painel
 * dizia "Loja / Unidade" e agrupava por `dados_vaga_folha.centro_custo`, porque não havia onde
 * cadastrar loja: como o sistema não deixa cadastrar o mesmo cliente duas vezes, a operação escrevia
 * o nome de cada loja no campo de centro de custo, em texto livre. Aquilo produziu 435 valores
 * distintos, dos quais 11 eram a mesma loja escrita de outro jeito, e o painel mostrava cada grafia
 * como uma linha própria.
 *
 * Agora existe `cliente_lojas`, a admissão aponta para uma loja de verdade (`admissoes.loja_id`) e o
 * agrupamento vem daí. Duas grafias da mesma loja deixaram de ser duas linhas. O CENTRO DE CUSTO
 * continua existindo como campo de folha, separado, e simplesmente parou de ser usado como loja.
 *
 * `loja` NULO é a linha "Sem Loja", que hoje é a MAIORIA: só as admissões carregadas ou vinculadas à
 * mão têm loja. O painel parecer mais vazio no começo é o esperado, não defeito: cada carga de
 * cliente enche mais. Ela vem do backend já no fim da lista.
 *
 * ─ O QUADRO COMPLETO POR STATUS (evolução de 27/08) ──────────────────────────────────────────
 *
 * `vagas` CONTINUA SENDO O "NA ESTEIRA", e o nome não mudou de propósito: é o número que o cilindro
 * sempre desenhou e é ele que sustenta a prova de que a soma das lojas é idêntica ao balde
 * "Total De Vagas Na Esteira" do topo da tela.
 *
 * `total` é o universo INTEIRO do projeto naquela loja (na esteira + em banco + os terminais que
 * estão vinculados), e `faltam` é `total - vagas`, a mesma forma que o quadro de Cargos usa
 * (`meta - vinculadas`).
 *
 * `declinios` vem de OUTRO recorte (cliente + período), como no quadro de Cargos e pelo mesmo
 * motivo: quem declina quase nunca chegou a `admissao_projeto` (§A.16). Ele é informação ao lado e
 * NÃO soma no total nem no faltam, e a tela diz isso em palavras.
 */
interface LinhaLoja {
  loja: string | null;
  vagas: number;
  total: number;
  concluidas: number;
  emAndamento: number;
  /**
   * META da loja neste projeto (docs/DESENHO-META-POR-LOJA.md). NULA quando o cargo não foi
   * detalhado por loja, e a célula fica VAZIA na tela: zero diria "não falta ninguém", e a verdade
   * é "ninguém definiu meta aqui".
   */
  meta: number | null;
  /** `meta - na esteira`. Nulo junto com a meta, pelo mesmo motivo. */
  faltam: number | null;
  /** Quem SAIU da esteira: o número que a coluna Faltam carregava antes de existir meta por loja. */
  foraDaEsteira: number;
  pausadas: number;
  emBanco: number;
  declinios: number;
}

/**
 * UMA CÉLULA DA MATRIZ CARGO x LOJA: o cruzamento clicável (27/08).
 *
 * Ela NÃO é uma terceira contagem: é a mesma leitura dos dois quadros, agrupada pelos DOIS eixos.
 * Somar por cargo devolve o quadro de cargos, somar por loja devolve o quadro de lojas, e é isso que
 * garante que clicar numa linha nunca faça aparecer número que a tela não mostrava antes.
 *
 * A META NÃO ESTÁ AQUI porque ela é cadastrada por CARGO no projeto inteiro (`projeto_vaga_cargo`) e
 * não existe por loja em lugar nenhum do sistema. A matriz carrega só os baldes de STATUS, que são
 * os que cruzam de verdade.
 */
interface CelulaMatriz {
  cargoId: string | null;
  cargoNome: string;
  loja: string | null;
  total: number;
  vagas: number;
  concluidas: number;
  emAndamento: number;
  faltam: number;
  pausadas: number;
  emBanco: number;
  declinios: number;
}

interface Analise {
  projeto: {
    id: string;
    nome: string;
    codCliente: string;
    clienteRazaoSocial: string;
    clienteNomeOperacao: string | null;
    dataInicio: string;
    dataFim: string;
    ativo: boolean;
  };
  termometro: {
    totalDias: number;
    decorridos: number;
    diasRestantes: number;
    /** Dias úteis que faltam para o projeto ABRIR, contando hoje. Zero depois que ele abriu. */
    diasParaInicio: number;
    situacao: "ok" | "atencao" | "critico" | "encerrado";
    percentualDecorrido: number;
  };
  totais: {
    vagas: number;
    vinculadas: number;
    concluidas: number;
    cadastradas: number;
    emAndamento: number;
    pausadas: number;
    declinios: number;
    emBanco: number;
    faltam: number;
    percentual: number;
  };
  porCargo: LinhaCargo[];
  grupos: LinhaGrupo[];
  /**
   * Vagas por loja / unidade, no MESMO recorte do balde "Total De Vagas Na Esteira": vinculados ao
   * projeto, terminais e banco fora (§A.16). A soma desta lista é aquele número, por construção.
   *
   * OPCIONAL DE PROPÓSITO, e isto é cinto de segurança de deploy, não desleixo de tipo: frontend e
   * backend sobem em passos separados, e por alguns minutos a tela nova conversa com o serviço
   * antigo, que ainda não manda este campo. Sem o opcional (e sem o `?? []` que o acompanha na tela),
   * a página inteira caía em "Application error", levando junto os gráficos que já funcionavam. Um
   * indicador novo pode nascer vazio por um minuto; o painel não pode apagar.
   */
  porLoja?: LinhaLoja[];
  /** A matriz do cruzamento clicável. Opcional pelo mesmo motivo do quadro: backend antigo no ar. */
  matriz?: CelulaMatriz[];
}

function fmtData(iso?: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function rotuloCliente(codCliente: string, nomeOperacao: string | null, razaoSocial: string): string {
  return `${codCliente} · ${nomeOperacao ?? razaoSocial}`;
}

/**
 * Cor do preenchimento por faixa. Não é enfeite: o card é lido de longe, e a cor é o que diz se o
 * cargo está resolvido antes de alguém ler o número. Vermelho abaixo de um terço, amarelo até
 * chegar perto, verde quando fechou.
 */
function corDoPreenchimento(pct: number): string {
  if (pct >= 100) return "var(--ok)";
  if (pct >= 66) return "var(--accent)";
  if (pct >= 33) return "var(--warn)";
  return "var(--danger)";
}

/**
 * Percentual de cobertura do cargo: quanto das vagas abertas já está com a gente. É conta de
 * DESENHO (cor e largura da barra), separada do `percentual` que vem do backend (concluídas sobre
 * vagas) e continua sendo o número da coluna Preenchimento da tabela.
 */
function percentualDe(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

const COR_TERMOMETRO: Record<Analise["termometro"]["situacao"], string> = {
  ok: "var(--ok)",
  atencao: "var(--warn)",
  critico: "var(--danger)",
  encerrado: "var(--danger)",
};

/** Trilho das barras: tema-aware pelos tokens, sem cor fixa que só funcione num dos dois temas. */
const TRILHO = "color-mix(in srgb, var(--text) 9%, transparent)";

/**
 * Uma barra do cargo: rótulo à esquerda, barra arredondada no meio, número à direita.
 *
 * A barra é um `div` com largura percentual e não um `rect` de SVG, pelo mesmo motivo da barra de
 * preenchimento da tabela: o card é fluido, e um SVG esticado com `preserveAspectRatio="none"`
 * deformaria o arredondamento das pontas junto da largura. Continua sendo desenho na mão, sem
 * biblioteca de gráfico.
 */
function Barra({
  rotulo,
  valor,
  mostrarValor = true,
  largura,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  /** A linha do "falta" já diz o número dentro da frase, então não repete o valor à direita. */
  mostrarValor?: boolean;
  largura: number;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <div>
      {/* RÓTULO EM CIMA DA BARRA, não ao lado. Os rótulos passaram a ser frases ("Total De Vagas Do
          Projeto"), e ao lado eles comeriam metade do card, deixando o trilho curto demais para
          comparar comprimento, que é a única coisa que a barra faz. Em cima, o trilho fica inteiro. */}
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-dim" title={rotulo}>
          {rotulo}
        </span>
        {mostrarValor && (
          <span
            className={`shrink-0 tabular-nums ${destaque ? "text-[15px] font-semibold text-text" : "text-sm text-dim"}`}
          >
            {valor}
          </span>
        )}
      </div>
      {/* O TRILHO É O MESMO NAS TRÊS LINHAS, e nada divide espaço com ele: a comparação entre as
          barras é por comprimento, e encurtar um trilho desenharia o maior número como a menor barra. */}
      <div
        className="mt-1 h-[14px] w-full overflow-hidden rounded-full"
        style={{ background: TRILHO }}
      >
        {largura > 0 && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${largura}%`, background: cor }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * MODAL DOS DECLÍNIOS: as duas perguntas que o número sozinho não responde.
 *
 * 1. QUANTO CUSTOU AO PROJETO. O declínio não é só uma admissão perdida, é uma vaga que voltou para
 *    a fila de captação com menos prazo do que tinha. O peso é sobre as VAGAS do projeto, e não
 *    sobre o total de admissões vinculadas, porque a meta é a vaga: perder 5 de um projeto de 100 é
 *    5% da entrega, independentemente de quantas pessoas passaram pelo processo.
 * 2. ONDE DÓI MAIS. O ranking por cargo, porque a reação é por cargo: quem declina em Atendente não
 *    se substitui com candidato de Caixa. Cargo sem declínio fica de fora, e não em lista de zeros.
 *
 * SEM CONSULTA NOVA: tudo sai do mesmo GET que já desenhou a tela (`porCargo` já traz `declinios` e
 * `vagas` por cargo). Um endpoint só para o modal abriria a porta para o modal e a tela discordarem,
 * que é exatamente o que o serviço evita ao mandar tudo numa leitura.
 *
 * §A.6: contagem por cargo, sem nome e sem CPF. "Quem declinou" é assunto do Gerenciador.
 */
function ModalDeclinios({
  dados,
  onClose,
}: {
  dados: Analise;
  onClose: () => void;
}) {
  const { declinios, vagas } = dados.totais;
  const pesoNaEntrega = percentualDe(declinios, vagas);
  const ranking = dados.porCargo
    .filter((l) => l.declinios > 0)
    .sort((a, b) => b.declinios - a.declinios || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"));
  const maior = ranking[0]?.declinios ?? 0;

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Análise Dos Declínios">
      <h2 className="mb-1 text-[19px] font-semibold text-text">Análise Dos Declínios</h2>
      <p className="mb-4 text-sm text-dim">
        {dados.projeto.nome}, quanto os declínios pesam na entrega e quais cargos mais perderam gente.
      </p>

      {/* PESO NA ENTREGA */}
      <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
          Peso Na Entrega Do Projeto
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-[34px] font-semibold leading-none tabular-nums"
            style={{ color: "var(--danger)" }}
          >
            {pesoNaEntrega}%
          </span>
          <span className="text-sm text-dim">
            das {vagas} vagas do projeto se perderam por declínio ou rescisão, {declinios}{" "}
            {declinios === 1 ? "admissão" : "admissões"} ao todo
          </span>
        </div>
        {/* A barra compara o perdido contra a meta inteira, então dá a proporção de relance. */}
        <div
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: TRILHO }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, pesoNaEntrega)}%`, background: "var(--danger)" }}
          />
        </div>
        <p className="mt-2 text-xs text-faint">
          É quanto da meta precisa ser buscado de novo. Não é o mesmo que a vaga estar aberta hoje:
          quem declinou pode já ter sido reposto por outra pessoa na esteira.
        </p>
      </div>

      {/* RANKING POR CARGO */}
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
        Declínios Por Cargo
      </h3>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-faint">Nenhum cargo com declínio neste projeto.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ranking.map((l) => (
            <div key={l.cargoId ?? l.cargoNome}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={l.cargoNome}>
                  {l.cargoNome}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                  {l.declinios}
                </span>
                {/* Peso DENTRO do cargo: 3 declínios em 4 vagas é outra história que 3 em 300. */}
                <span className="w-[64px] shrink-0 text-right text-xs tabular-nums text-faint">
                  {l.vagas > 0 ? `${percentualDe(l.declinios, l.vagas)}% do cargo` : "sem meta"}
                </span>
              </div>
              <div
                className="mt-1 h-[12px] w-full overflow-hidden rounded-full"
                style={{ background: TRILHO }}
              >
                {/* A escala é o MAIOR declínio do ranking, para o primeiro colocado encher a barra e
                    os demais se compararem com ele. Escala pelas vagas achataria todos contra zero. */}
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((l.declinios / Math.max(1, maior)) * 100))}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--danger) 45%, transparent), var(--danger))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

/**
 * PREENCHIMENTO DO CARGO em três barras (troca do cilindro, decisão do diretor).
 *
 * As três respondem, na ordem, as três perguntas que o time faz olhando um projeto de alto volume:
 * quanto o projeto contratou (VAGAS ABERTAS), quanto já está com a gente (NO PROJETO) e quanto ainda
 * falta buscar. A terceira é derivada das duas primeiras, e é derivada de propósito: número que se
 * calcula sozinho nunca discorda dos outros dois.
 *
 * "FALTA BUSCAR" É CONTRA O VÍNCULO, não contra o concluído: a pergunta desta seção é de captação
 * ("ainda preciso de gente?"), não de conclusão. Quem responde por conclusão é a coluna Preenchimento
 * da tabela logo abaixo, que continua sendo concluídas sobre vagas.
 *
 * EXCEDENTE em vez de número negativo: com mais gente vinculada do que vaga aberta, "falta" é zero
 * (não se busca gente para vaga que não existe) e o que sobra vira uma tag no próprio card. É o caso
 * de hoje na Bienal, onde a vaga cadastrada é o próprio pessoal que já entrou.
 *
 * A ESCALA É COMUM ÀS TRÊS BARRAS do card (o maior valor entre abertas e no projeto), então elas se
 * comparam entre si. Cada cargo tem escala própria, e não uma global: com um cargo de 300 e outro de
 * 4, a escala global deixaria o de 4 invisível.
 */
function BarrasDoCargo({ linha }: { linha: LinhaCargo }) {
  const { vagas, vinculadas } = linha;
  // O NÚMERO VEM DO BACKEND, não é recalculado aqui (correção de 13/08/2026). Este card fazia a
  // própria conta (`vagas - vinculadas`) enquanto o topo e a tabela usavam outra, e as duas leituras
  // do MESMO número discordavam na tela: os cards somavam 6 e o topo dizia 4. Agora existe uma régua
  // só, no serviço, e o card apenas a apresenta. O `Math.max` que sobrou não é régua, é exibição:
  // acima da meta o card diz "Excedente +N" em vez de um "Falta" negativo, e é o mesmo `faltam` do
  // topo com o sinal trocado.
  const falta = Math.max(0, linha.faltam);
  const excedente = Math.max(0, -linha.faltam);
  const cobertura = percentualDe(vinculadas, vagas);
  // COMPLETO: a meta foi batida (todas as vagas na esteira). Antes desta marca a terceira linha
  // ficava VAZIA (falta = 0 desenha barra de largura 0) e nada dizia que o cargo fechou. Agora ela
  // vira um cilindro CHEIO na cor de "completo" (violeta --completo, aprovada pelo diretor), que é a
  // única cor sem papel utilitário na análise, então não se confunde com o vermelho/amarelo/azul/
  // verde das faixas em andamento.
  const completo = vagas > 0 && falta === 0;
  // Sem meta cadastrada não há faixa de cor a aplicar: o card fica no acento, neutro, e o rótulo
  // diz "sem meta" em vez de mostrar 0% com a barra cheia de gente.
  const cor = vagas === 0 ? "var(--accent)" : corDoPreenchimento(cobertura);

  const escala = Math.max(vagas, vinculadas, 1);
  // Piso de 3% para valor não nulo: sem ele, 1 vaga contra 300 desenha uma barra invisível e o card
  // mente dizendo que não há ninguém.
  const largura = (v: number) => (v <= 0 ? 0 : Math.max(3, Math.round((v / escala) * 100)));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <h4
          className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text"
          title={linha.cargoNome}
        >
          {linha.cargoNome}
        </h4>
        {/* Excedente só faz sentido contra uma meta: sem vaga cadastrada, a tag seria "sobrou tudo",
            que não diz nada. Nesse caso o cabeçalho fica só com "Sem Meta". */}
        {excedente > 0 && vagas > 0 && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{
              color: "var(--warn-2)",
              background: "color-mix(in srgb, var(--warn-2) 14%, transparent)",
            }}
          >
            Excedente +{excedente}
          </span>
        )}
        {/* Cargo completo troca o badge de percentual por uma tag "Completo" na cor de completo:
            o número 100% dizia menos que a palavra, e o violeta é o sinal que salta na grade. */}
        {completo ? (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              color: "var(--completo)",
              background: "color-mix(in srgb, var(--completo) 16%, transparent)",
            }}
          >
            Completo
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
            style={{ color: cor, background: `color-mix(in srgb, ${cor} 15%, transparent)` }}
          >
            {vagas === 0 ? "Sem Meta" : `${cobertura}%`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Barra
          rotulo="Total De Vagas Do Projeto"
          valor={vagas}
          largura={largura(vagas)}
          cor={`color-mix(in srgb, var(--accent) 30%, transparent)`}
        />
        <Barra
          rotulo="Total De Vagas Na Esteira"
          valor={vinculadas}
          largura={largura(vinculadas)}
          cor={`linear-gradient(90deg, color-mix(in srgb, ${cor} 62%, transparent), ${cor})`}
          destaque
        />
        {/* A TERCEIRA LINHA É UMA FRASE, não um rótulo com número ao lado: o diretor pediu que ela
            diga quanto falta para completar o projeto. Dois desfechos entram no lugar do "Falta 0",
            que seria a leitura errada de duas situações diferentes: sem vaga cadastrada não há meta
            a completar (o cargo tem gente e nenhuma cota), e com a meta batida o projeto fechou. */}
        {/* Completo desenha a barra CHEIA (100%) em violeta, o sinal que faltava. Sem meta, barra
            vazia e frase própria. Faltando gente, a barra amarela mostra o tamanho do que falta. */}
        <Barra
          rotulo={
            vagas === 0
              ? "Sem Meta Cadastrada Para Este Cargo"
              : completo
                ? "Cargo Completo"
                : `Falta ${falta} Para Completar O Projeto`
          }
          valor={falta}
          mostrarValor={false}
          largura={completo ? 100 : largura(falta)}
          cor={
            completo
              ? `linear-gradient(90deg, color-mix(in srgb, var(--completo) 55%, transparent), var(--completo))`
              : `linear-gradient(90deg, color-mix(in srgb, var(--warn) 45%, transparent), color-mix(in srgb, var(--warn) 85%, transparent))`
          }
        />
      </div>
    </div>
  );
}

export default function AltoVolumeAnalisePage() {
  const { token } = useAuth();

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [codCliente, setCodCliente] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [dados, setDados] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Modais de leitura dos baldes clicáveis. Estado de TELA, nada de recorte nem de filtro. */
  const [modalDeclinios, setModalDeclinios] = useState(false);
  const [modalBanco, setModalBanco] = useState(false);

  const carregarProjetos = useCallback(async () => {
    try {
      const rows = await apiFetch<Projeto[]>("/admin/alto-volume", { token });
      const ativos = rows.filter((p) => p.ativo);
      setProjetos(ativos);
      // Abre já no primeiro projeto ativo: painel que nasce vazio pedindo dois cliques faz o time
      // achar que a tela está quebrada.
      if (ativos.length > 0) {
        setCodCliente(ativos[0].codCliente);
        setProjetoId(ativos[0].id);
      } else {
        setCarregando(false);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os projetos");
      setCarregando(false);
    }
  }, [token]);

  const carregarAnalise = useCallback(
    async (id: string) => {
      setCarregando(true);
      setErro(null);
      try {
        setDados(
          await apiFetch<Analise>(`/admin/alto-volume/${encodeURIComponent(id)}/analise`, { token }),
        );
      } catch (e) {
        setDados(null);
        setErro(e instanceof Error ? e.message : "Erro ao carregar a análise");
      } finally {
        setCarregando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (token) void carregarProjetos();
  }, [token, carregarProjetos]);

  useEffect(() => {
    if (token && projetoId) void carregarAnalise(projetoId);
  }, [token, projetoId, carregarAnalise]);

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of projetos) {
      if (!mapa.has(p.codCliente)) {
        mapa.set(p.codCliente, rotuloCliente(p.codCliente, p.clienteNomeOperacao, p.clienteRazaoSocial));
      }
    }
    return [...mapa].map(([value, label]) => ({ value, label }));
  }, [projetos]);

  const projetosDoCliente = useMemo(
    () => projetos.filter((p) => p.codCliente === codCliente),
    [projetos, codCliente],
  );

  /** Trocar de CLIENTE cai no primeiro projeto dele: cliente sem projeto escolhido não tem painel. */
  function escolherCliente(cod: string) {
    setCodCliente(cod);
    const primeiro = projetos.find((p) => p.codCliente === cod);
    setProjetoId(primeiro?.id ?? "");
    if (!primeiro) setDados(null);
  }

  /**
   * ─ O CRUZAMENTO CLICÁVEL: a linha vira filtro (pedido do diretor, 27/08) ─────────────────────
   *
   * COMO ELE LÊ: clicar num CARGO faz o quadro de LOJAS mostrar aquele cargo por loja; clicar numa
   * LOJA faz o quadro de CARGOS mostrar aquela loja por cargo. Clicar de novo na mesma linha
   * desfaz. Nunca há dois cruzamentos ligados ao mesmo tempo: escolher de um lado desliga o outro,
   * porque "Vendedor na Loja Sul" é uma célula, não um recorte, e a tela não é uma tabela dinâmica.
   *
   * ELE ATUALIZA SÓ AS TABELAS, e é essa a exigência: os KPIs, o termômetro, as barras por cargo e o
   * alerta por grupo continuam falando do PROJETO INTEIRO. Um cruzamento que mexesse no topo faria o
   * diretor achar que o projeto encolheu ao clicar numa linha.
   *
   * NADA É BUSCADO DE NOVO: o cruzamento recorta a MATRIZ que já veio no mesmo GET que desenhou a
   * tela. Sem requisição nova, sem instante diferente, e sem chance de os dois quadros discordarem.
   */
  const [cruzamento, setCruzamento] = useState<
    { tipo: "cargo"; id: string | null; rotulo: string } | { tipo: "loja"; loja: string | null; rotulo: string } | null
  >(null);
  const matriz = useMemo(() => dados?.matriz ?? [], [dados]);

  /** Soma um punhado de células da matriz num único conjunto de baldes. */
  const somar = useCallback(
    (celulas: CelulaMatriz[]) =>
      celulas.reduce(
        (a, c) => ({
          total: a.total + c.total,
          vagas: a.vagas + c.vagas,
          concluidas: a.concluidas + c.concluidas,
          emAndamento: a.emAndamento + c.emAndamento,
          faltam: a.faltam + c.faltam,
          pausadas: a.pausadas + c.pausadas,
          emBanco: a.emBanco + c.emBanco,
          declinios: a.declinios + c.declinios,
        }),
        { total: 0, vagas: 0, concluidas: 0, emAndamento: 0, faltam: 0, pausadas: 0, emBanco: 0, declinios: 0 },
      ),
    [],
  );

  /**
   * O QUADRO DE LOJAS: o de sempre, ou o recorte de um cargo. Quando um cargo está escolhido, cada
   * linha é aquele cargo NAQUELA loja, com os mesmos baldes e a mesma ordem (maior na esteira
   * primeiro, não informado no fim).
   */
  const lojas = useMemo<LinhaLoja[]>(() => {
    const base = dados?.porLoja ?? [];
    if (cruzamento?.tipo !== "cargo") return base;
    const porLoja = new Map<string, CelulaMatriz[]>();
    for (const c of matriz.filter((m) => m.cargoId === cruzamento.id)) {
      const k = c.loja ?? "\u0000";
      porLoja.set(k, [...(porLoja.get(k) ?? []), c]);
    }
    return [...porLoja.values()]
      .map((cels) => ({
        loja: cels[0].loja,
        ...somar(cels),
        /**
         * META NULA no recorte por CARGO, e isso é honestidade, não lacuna. A meta da loja é a soma
         * de TODOS os cargos detalhados nela; recortar por um cargo e repetir a meta cheia diria que
         * aquele cargo sozinho responde por ela. Dividir seria pior ainda, seria ratear, que é
         * inventar número (§A.16). A célula fica vazia, como a coluna Vagas do outro quadro já faz
         * no recorte inverso.
         */
        meta: null,
        faltam: null,
        foraDaEsteira: somar(cels).total - somar(cels).vagas,
      }))
      .sort((a, b) => {
        if (a.loja === null) return 1;
        if (b.loja === null) return -1;
        return b.vagas - a.vagas || a.loja.localeCompare(b.loja, "pt-BR");
      });
  }, [dados, cruzamento, matriz, somar]);

  /**
   * O QUADRO DE CARGOS: o de sempre, ou o recorte de uma loja.
   *
   * A COLUNA "VAGAS" (a META) FICA NULA no recorte por loja, e isso é honestidade, não lacuna: a
   * meta é cadastrada por CARGO no projeto inteiro (`projeto_vaga_cargo`) e NÃO existe por loja em
   * lugar nenhum do sistema. Repetir a meta do projeto em cada loja diria que a Loja Sul sozinha tem
   * as 66 vagas de Vendedor, e ratear a meta seria inventar número (§A.16). A célula mostra
   * "não informado" (§A.11) e a tela explica em uma linha.
   *
   * "FALTAM" no recorte passa a ser `total - na esteira`, a mesma régua do quadro de lojas, porque é
   * o universo da loja que está em cena e não a meta do projeto.
   */
  const cargosVisiveis = useMemo<LinhaCargo[]>(() => {
    const base = dados?.porCargo ?? [];
    if (cruzamento?.tipo !== "loja") return base;
    const porCargo = new Map<string, CelulaMatriz[]>();
    for (const c of matriz.filter((m) => m.loja === cruzamento.loja)) {
      const k = c.cargoId ?? "\u0000";
      porCargo.set(k, [...(porCargo.get(k) ?? []), c]);
    }
    return [...porCargo.values()]
      .map((cels) => {
        const b = somar(cels);
        return {
          cargoId: cels[0].cargoId,
          cargoNome: cels[0].cargoNome,
          // META AUSENTE no recorte por loja: ver a nota acima. `NaN` seria pior; nulo é o estado.
          vagas: null as unknown as number,
          vinculadas: b.vagas,
          concluidas: b.concluidas,
          cadastradas: 0,
          emAndamento: b.emAndamento,
          pausadas: b.pausadas,
          declinios: b.declinios,
          emBanco: b.emBanco,
          faltam: b.faltam,
          percentual: 0,
        } as LinhaCargo;
      })
      .sort((a, b) => b.vinculadas - a.vinculadas || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"));
  }, [dados, cruzamento, matriz, somar]);

  /** Liga ou desliga o cruzamento. Clicar na linha já escolhida desfaz (toggle). */
  const alternarCruzamento = useCallback(
    (alvo: NonNullable<typeof cruzamento>) =>
      setCruzamento((atual) => {
        if (!atual || atual.tipo !== alvo.tipo) return alvo;
        const mesmo =
          alvo.tipo === "cargo"
            ? atual.tipo === "cargo" && atual.id === alvo.id
            : atual.tipo === "loja" && atual.loja === alvo.loja;
        return mesmo ? null : alvo;
      }),
    [],
  );
  /**
   * Escala das barras de loja / unidade: a MAIOR loja enche a barra e as demais se comparam com ela.
   * Escalar pelo total do projeto achataria todas contra zero num cliente com muitas lojas, que é
   * justamente o cliente para quem este indicador existe.
   */
  const maiorLoja = useMemo(() => lojas.reduce((m, l) => Math.max(m, l.vagas), 0), [lojas]);
  /**
   * ORDENAÇÃO CLICÁVEL das DUAS tabelas (§A.12), cada uma com a sua: são listas diferentes, e uma
   * ordenação só faria clicar numa mexer na outra.
   *
   * SÓ ACRESCENTA (§A.26): a ordem padrão continua a que o backend manda (maior meta primeiro nos
   * cargos, data de entrada nos grupos), e a ordenação é sobreposição por clique do usuário. A linha
   * de TOTAL não entra na lista ordenada: ela é somatório, e ordenar não a move do rodapé.
   */
  const colunasCargo = useMemo<ColOrd<LinhaCargo>[]>(
    () => [
      { chave: "cargo", tipo: "texto", valor: (l) => l.cargoNome },
      { chave: "vagas", tipo: "numero", valor: (l) => l.vagas },
      { chave: "vinculadas", tipo: "numero", valor: (l) => l.vinculadas },
      { chave: "concluidas", tipo: "numero", valor: (l) => l.concluidas },
      { chave: "emAndamento", tipo: "numero", valor: (l) => l.emAndamento },
      { chave: "faltam", tipo: "numero", valor: (l) => l.faltam },
      { chave: "pausadas", tipo: "numero", valor: (l) => l.pausadas },
      { chave: "declinios", tipo: "numero", valor: (l) => l.declinios },
    ],
    [],
  );
  const ordCargo = useOrdenacao(colunasCargo, cargosVisiveis);

  /**
   * O RODAPÉ DO QUADRO DE CARGOS SEGUE O RECORTE. Sem cruzamento ele é idêntico aos baldes do topo
   * (a soma das linhas por cargo SEMPRE foi o total, por construção do backend); com a loja
   * escolhida ele passa a somar só as linhas visíveis, senão o "Total" contradiria a tabela logo
   * acima dele, que é o defeito que a §A.27 existe para evitar.
   */
  const totaisCargo = useMemo(
    () =>
      cargosVisiveis.reduce(
        (a, l) => ({
          vinculadas: a.vinculadas + l.vinculadas,
          concluidas: a.concluidas + l.concluidas,
          emAndamento: a.emAndamento + l.emAndamento,
          faltam: a.faltam + l.faltam,
          pausadas: a.pausadas + l.pausadas,
          declinios: a.declinios + l.declinios,
        }),
        { vinculadas: 0, concluidas: 0, emAndamento: 0, faltam: 0, pausadas: 0, declinios: 0 },
      ),
    [cargosVisiveis],
  );

  const colunasGrupo = useMemo<ColOrd<LinhaGrupo>[]>(
    () => [
      { chave: "grupo", tipo: "texto", valor: (g) => g.rotulo },
      { chave: "entrada", tipo: "data", valor: (g) => g.dataEntrada },
      { chave: "vagas", tipo: "numero", valor: (g) => g.vagas },
      { chave: "noGrupo", tipo: "numero", valor: (g) => g.vinculadas },
      { chave: "concluidas", tipo: "numero", valor: (g) => g.concluidas },
      { chave: "atrasadas", tipo: "numero", valor: (g) => g.atrasadas },
    ],
    [],
  );
  const ordGrupo = useOrdenacao(colunasGrupo, dados?.grupos ?? []);

  /**
   * §A.29: a tabela de lojas nasce ORDENÁVEL, com a mesma peça das outras duas desta tela. A ordem
   * padrão continua a do backend (maior na esteira primeiro, não informado no fim), e o clique é
   * sobreposição. A linha de TOTAL fica fora da lista ordenada: ela é somatório e não sai do rodapé.
   */
  /**
   * AS DUAS TABELAS (decisão do diretor, 02/09/2026), e o motivo de serem duas e não uma.
   *
   * A primeira responde "como está o PLANO": toda loja que recebeu meta, tenha gente ou não. A
   * segunda responde "o que está FORA do plano": gente alocada em loja sem meta, e gente sem loja
   * nenhuma. Misturar as duas coisas numa tabela só é o que fazia o diretor olhar um número e não
   * saber se era planejamento ou desvio.
   *
   * A SEGUNDA SÓ APARECE QUANDO EXISTE CASO. Projeto onde todo mundo está em loja com meta não
   * ganha uma tabela vazia dizendo que está tudo certo: a ausência dela já diz isso.
   */
  /** A loja cujo modal "Ver Pessoas" está aberto. `undefined` = fechado; `null` = a linha Sem Loja. */
  const [pessoasDe, setPessoasDe] = useState<{ loja: string | null } | null>(null);

  const lojasPorMeta = useMemo(() => lojas.filter((l) => l.meta !== null), [lojas]);
  const lojasForaDoPlano = useMemo(
    () => lojas.filter((l) => l.meta === null && (l.total > 0 || l.declinios > 0)),
    [lojas],
  );

  const colunasLoja = useMemo<ColOrd<LinhaLoja>[]>(
    () => [
      { chave: "loja", tipo: "texto", valor: (l) => l.loja },
      { chave: "meta", tipo: "numero", valor: (l) => l.meta },
      { chave: "total", tipo: "numero", valor: (l) => l.total },
      { chave: "vagas", tipo: "numero", valor: (l) => l.vagas },
      { chave: "concluidas", tipo: "numero", valor: (l) => l.concluidas },
      { chave: "emAndamento", tipo: "numero", valor: (l) => l.emAndamento },
      { chave: "faltam", tipo: "numero", valor: (l) => l.faltam },
      { chave: "pausadas", tipo: "numero", valor: (l) => l.pausadas },
      { chave: "declinios", tipo: "numero", valor: (l) => l.declinios },
    ],
    [],
  );

  const t = dados?.termometro;
  /** Projeto que ainda não abriu: o termômetro troca a pergunta de "até o fim" para "para começar". */
  const naoIniciou = (t?.diasParaInicio ?? 0) > 0;
  /** Cobertura geral: o card "% Total Entregue" e o rodapé das barras leem esta MESMA conta. */
  const coberturaGeral = percentualDe(dados?.totais.vinculadas ?? 0, dados?.totais.vagas ?? 0);
  /** Lojas / unidades, com o `?? []` que segura a tela quando o backend ainda é o da versão anterior. */
  // A TABELA 1 é o PLANO: só as lojas que receberam meta. A ordenação clicável segue valendo (§A.29).
  const ordLoja = useOrdenacao(colunasLoja, lojasPorMeta);
  /**
   * O RODAPÉ DA TABELA DE LOJAS SAI DA SOMA DAS LINHAS, e não dos baldes do topo, por um motivo que
   * a §A.27 já cobrou uma vez: o `total` e o `faltam` por loja são do universo da loja, e o balde do
   * topo é da meta cadastrada por cargo. Somar as linhas é o que garante que o rodapé seja o
   * somatório do que está acima dele, e não um número de outra régua parecido o bastante para
   * ninguém desconfiar.
   *
   * A ÚNICA COLUNA QUE TAMBÉM BATE COM O TOPO É "NA ESTEIRA", e isso é a prova que já existia: a
   * soma dela é o balde "Total De Vagas Na Esteira". A tela mostra as duas na mesma linha.
   */
  const totalLojas = useMemo(
    () =>
      lojas.reduce(
        (acc, l) => ({
          total: acc.total + l.total,
          vagas: acc.vagas + l.vagas,
          concluidas: acc.concluidas + l.concluidas,
          emAndamento: acc.emAndamento + l.emAndamento,
          /**
           * META e FALTAM somam SÓ o que existe: loja sem meta entra como zero na soma, e não como
           * "zero de meta". A diferença aparece no rodapé, que mostra em branco quando NENHUMA loja
           * tem meta, em vez de um zero que diria que o projeto tem meta zero.
           */
          meta: acc.meta + (l.meta ?? 0),
          faltam: acc.faltam + (l.faltam ?? 0),
          pausadas: acc.pausadas + l.pausadas,
          declinios: acc.declinios + l.declinios,
        }),
        { total: 0, vagas: 0, concluidas: 0, emAndamento: 0, meta: 0, faltam: 0, pausadas: 0, declinios: 0 },
      ),
    [lojas],
  );

  return (
    <>
      {/* FAIXA DO TÍTULO, a MESMA do Painel: título, alternador de visão e tema, na mesma ordem e na
          mesma altura de 40px. É o que faz trocar de pílula parecer trocar de visão, e não sair para
          outra tela: o topo não se mexe, só o conteúdo abaixo dele muda. */}
      <div className="mb-3 flex items-center gap-2">
        <h1 className="mr-auto min-w-0 truncate text-[21px] font-semibold leading-tight text-text">
          Controle Gerencial
        </h1>
        <NavDiretoria />
        {/* Reserva do lugar do ícone de filtro, que só existe no Painel (os filtros de lá não valem
            para esta visão). Sem a reserva o alternador escorrega 48px para a direita ao trocar de
            pílula, e a troca de visão ganha um solavanco que não tem motivo nenhum. */}
        <div aria-hidden className="h-10 w-10 shrink-0" />
        <ThemeToggle />
      </div>

      <p className="mb-5 text-sm text-dim">
        Como o projeto está indo: preenchimento por cargo, situação das admissões e quanto tempo resta
        até o fim do período.
      </p>

      {/* SELETORES: cliente e projeto, no molde do Controle Gerencial. Trocar qualquer um recarrega
          o painel inteiro, para os números nunca serem de dois projetos ao mesmo tempo. */}
      <GlassCard className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <label className="flex items-center gap-2 text-sm text-dim">
          <span className="whitespace-nowrap">Cliente</span>
          <div className="min-w-[300px]">
            <Select
              value={codCliente}
              onChange={escolherCliente}
              placeholder="Cliente"
              ariaLabel="Cliente do projeto"
              searchable
              menuFit
              options={clientes}
            />
          </div>
        </label>
        <label className="flex items-center gap-2 text-sm text-dim">
          <span className="whitespace-nowrap">Projeto</span>
          <div className="min-w-[280px]">
            <Select
              value={projetoId}
              onChange={setProjetoId}
              placeholder="Projeto"
              ariaLabel="Projeto de alto volume"
              searchable
              menuFit
              options={projetosDoCliente.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
        </label>
      </GlassCard>

      {erro && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      {carregando && !dados ? (
        <GlassCard className="p-8 text-center text-faint">Carregando a análise…</GlassCard>
      ) : !dados ? (
        <GlassCard className="p-8 text-center text-faint">
          Nenhum projeto ativo para analisar. Cadastre um projeto no Alto Volume.
        </GlassCard>
      ) : (
        <>
          {/* ── CABEÇALHO, ENTREGA, TERMÔMETRO E BALDES ─────────────────── */}
          <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_210px_320px]">
            <GlassCard className="p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[17px] font-semibold text-text">{dados.projeto.nome}</h2>
                <span className="text-sm text-dim">
                  {rotuloCliente(
                    dados.projeto.codCliente,
                    dados.projeto.clienteNomeOperacao,
                    dados.projeto.clienteRazaoSocial,
                  )}
                </span>
                <span className="ml-auto text-sm text-dim">
                  {fmtData(dados.projeto.dataInicio)} a {fmtData(dados.projeto.dataFim)}
                </span>
              </div>

              <p className="mb-3 text-xs text-faint">
                a conta fecha no total de vagas: em andamento + concluídas + faltam ={" "}
                {dados.totais.vagas}. tudo conta quem está vinculado a este projeto. declínios ficam
                fora da conta e contam o cliente {dados.projeto.codCliente} no período, como
                informação separada
              </p>

              {/* BALDES DO PROJETO (régua do diretor): TODOS leem o mesmo universo, os vinculados a
                  este projeto, e é isso que faz a conta fechar na meta. Em Andamento + Concluídas +
                  Faltam = Total De Vagas Do Projeto, exato.

                  DECLÍNIO FICA FORA DA MATEMÁTICA (mesma decisão) e segue no recorte cliente +
                  período: ele não soma nem subtrai da meta, porque a vaga que a pessoa declinou
                  continua aberta e já está contada em Faltam. Contá-lo entre os vinculados também
                  esconderia o que o projeto perdeu (§A.16, 22 dos 23 declínios nunca foram
                  vinculados). O card e o modal continuam iguais.

                  O card "Total De Admissões Cadastradas" saiu por decisão do diretor. O número
                  continua vindo do backend, então voltar é uma linha. O card "Pausadas" saiu antes,
                  pelo mesmo caminho: a operação não usa mais o estado. */}
              {/* SEIS COLUNAS só a partir de 1536px, porque o card "% Total Entregue" tirou 230px da
                  faixa e a 1366 as seis caíam para 78px cada, cortando rótulo no meio (§A.20).
                  Abaixo disso, três colunas em duas linhas. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
                <Balde rotulo="Total De Vagas Do Projeto" valor={dados.totais.vagas} />
                {/* A QUEBRA ATIVO x BANCO (decisão do diretor, 13/08/2026). O número grande é o de
                    quem CONSOME vaga, e continua sendo só os ativos: somar o banco aqui faria o
                    percentual de cobertura contar como vaga coberta quem não é dono de vaga nenhuma,
                    o oposto da regra. O banco entra na linha de apoio, visível e fora da conta, do
                    mesmo jeito que o declínio já fica.
                    BANCO É RESERVA: o candidato não é dono da vaga, então a vaga volta a faltar.
                    PAUSADA CONSOME: é o candidato DAQUELA vaga, só parado, e a vaga não está livre
                    para outra pessoa, por isso ela segue dentro do número grande.
                    Exibição pura: os dois números já vinham do backend, nada aqui recalcula régua.
                    TEXTO CURTO POR CAUSA DA LARGURA (§A.20): o balde ocupa um sexto da faixa, e a
                    frase inteira ("em processamento ativo", "aguardando em banco") quebrava em
                    quatro linhas e empurrava o número para fora do alinhamento dos vizinhos. A frase
                    completa fica na dica, onde há espaço. */}
                <Balde
                  rotulo="Total De Vagas Na Esteira"
                  valor={dados.totais.vinculadas}
                  quebra={`${dados.totais.vinculadas} ativos, ${dados.totais.emBanco} em banco`}
                  dica={`${dados.totais.vinculadas} em processamento ativo e ${dados.totais.emBanco} aguardando em banco. O banco fica visível mas fora da conta das vagas: quem está em banco não é dono de vaga, então a vaga volta a faltar`}
                />
                <Balde
                  rotulo="Total De Admissões Concluídas"
                  valor={dados.totais.concluidas}
                  cor="var(--ok)"
                  dica="Cadastro concluído e sem integração pendente, a mesma régua do Gerenciador"
                />
                <Balde
                  rotulo="Total Em Andamento"
                  valor={dados.totais.emAndamento}
                  cor="var(--accent)"
                  dica="Vinculadas em processo vivo que ainda não concluíram"
                />
                {/* FALTAM ganhou card próprio: é a terceira parcela da conta, e sem ele a soma que o
                    diretor confere ficaria só na tabela. */}
                <Balde
                  rotulo="Total De Vagas Que Faltam"
                  valor={dados.totais.faltam}
                  cor="var(--warn)"
                  dica="Total de vagas menos as concluídas e as que estão em andamento"
                />
                {/* CARD DIVIDIDO NO MEIO (decisão do diretor): declínios em cima, em banco embaixo.
                    Os dois são desfechos que saem do preenchimento (§A.16 para declínio, decisão do
                    diretor para banco), e cada metade abre o próprio modal. Só abre a metade que tem
                    número: linha zerada não tem o que mostrar. */}
                <BaldeDividido
                  cima={{
                    rotulo: "Declínios",
                    valor: dados.totais.declinios,
                    cor: "var(--danger)",
                    onClick: dados.totais.declinios > 0 ? () => setModalDeclinios(true) : undefined,
                    dica:
                      dados.totais.declinios > 0
                        ? "Ver o peso dos declínios no projeto e quais cargos mais declinaram"
                        : undefined,
                  }}
                  baixo={{
                    rotulo: "Em Banco",
                    valor: dados.totais.emBanco,
                    cor: "var(--warn)",
                    onClick: dados.totais.emBanco > 0 ? () => setModalBanco(true) : undefined,
                    dica:
                      dados.totais.emBanco > 0
                        ? "Ver a quantidade de admissões em banco por cargo"
                        : undefined,
                  }}
                />
              </div>
            </GlassCard>

            {/* % TOTAL ENTREGUE: a cobertura geral num número só, ao lado do termômetro, porque as
                duas perguntas da diretoria são estas e se leem juntas: quanto do projeto já está de
                pé e quanto tempo ainda há.

                REUSA a cobertura geral que já existe (vinculadas sobre vagas), a mesma conta do
                rodapé do preenchimento por cargo. Recalcular com outra fórmula seria criar dois
                números para a mesma pergunta, que é como um painel começa a se contradizer. */}
            <GlassCard className="flex flex-col justify-between p-4">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                % Total Entregue
              </h3>

              <div className="my-3">
                <span
                  className="text-[34px] font-semibold leading-none tabular-nums"
                  style={{ color: corDoPreenchimento(coberturaGeral) }}
                >
                  {coberturaGeral}%
                </span>
              </div>

              <div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, coberturaGeral)}%`,
                      background: corDoPreenchimento(coberturaGeral),
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-faint">
                  {dados.totais.vinculadas} de {dados.totais.vagas} vagas do projeto
                </p>
              </div>
            </GlassCard>

            {/* TERMÔMETRO: o prazo é a razão de a frente existir, então ele tem card próprio e fica
                ao lado dos baldes, não escondido no rodapé. */}
            <GlassCard className="flex flex-col justify-between p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Prazo Do Projeto
                </h3>
                <Pill
                  tone={
                    t!.situacao === "ok"
                      ? "ok"
                      : t!.situacao === "atencao"
                        ? "wn"
                        : t!.situacao === "critico"
                          ? "or"
                          : "dg"
                  }
                >
                  {t!.situacao === "ok"
                    ? "No Prazo"
                    : t!.situacao === "atencao"
                      ? "Atenção"
                      : t!.situacao === "critico"
                        ? "Última Semana"
                        : "Encerrado"}
                </Pill>
              </div>

              <div className="my-3">
                <div className="flex items-baseline gap-2">
                  {/* ANTES DE ABRIR, o número é a contagem para COMEÇAR (correção do diretor): dizer
                      "8 dias úteis até o fim" de um projeto que só abre no mês que vem responde a
                      pergunta errada. Quem olha um projeto futuro quer saber quanto tempo ainda tem
                      para captar. Depois da abertura, o card volta a contar o prazo até o fim. */}
                  <span
                    className="text-[34px] font-semibold leading-none tabular-nums"
                    style={{ color: COR_TERMOMETRO[t!.situacao] }}
                  >
                    {naoIniciou ? t!.diasParaInicio : t!.diasRestantes < 0 ? 0 : t!.diasRestantes}
                  </span>
                  <span className="text-sm text-dim">
                    {naoIniciou
                      ? t!.diasParaInicio === 1
                        ? "dia útil para começar"
                        : "dias úteis para começar"
                      : t!.diasRestantes < 0
                        ? "o período já terminou"
                        : t!.diasRestantes === 1
                          ? "dia útil até o fim"
                          : "dias úteis até o fim"}
                  </span>
                </div>
              </div>

              {/* Barra do prazo decorrido. Mesma leitura do termômetro: enche com o tempo passando. */}
              <div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, t!.percentualDecorrido)}%`,
                      background: COR_TERMOMETRO[t!.situacao],
                    }}
                  />
                </div>
                {/* Antes de abrir, sem legenda: o diretor pediu só o número (15) e o "para começar".
                    A frase "o período tem 8 dias úteis" confundia a diretoria e saiu. */}
                {!naoIniciou && (
                  <p className="mt-1.5 text-xs text-faint">
                    {t!.decorridos} de {t!.totalDias} dias úteis do período
                  </p>
                )}
              </div>
            </GlassCard>
          </div>

          {/* ── BARRAS POR CARGO ────────────────────────────────────────── */}
          <GlassCard className="mb-5 p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                Preenchimento Por Cargo
              </h3>
              <span className="text-sm text-dim">
                total de vagas do projeto, quanto já está na esteira e quanto falta para completar. o
                percentual do card é o quanto das vagas do projeto já está na esteira
              </span>
              <span className="ml-auto text-sm text-dim">
                cobertura geral:{" "}
                <span className="font-semibold tabular-nums text-text">{coberturaGeral}%</span>
              </span>
            </div>

            {dados.porCargo.length === 0 ? (
              <p className="py-8 text-center text-faint">
                Nenhum cargo com vaga cadastrada nem admissão vinculada neste projeto.
              </p>
            ) : (
              <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
                {dados.porCargo.map((l) => (
                  <BarrasDoCargo key={l.cargoId ?? "sem-cargo"} linha={l} />
                ))}
              </div>
            )}
          </GlassCard>

          {/* ── O AVISO DO CRUZAMENTO ───────────────────────────────────────
              Ele existe porque o cruzamento é INVISÍVEL de outro jeito: as duas tabelas passam a
              mostrar números menores e nada na tela diria por quê. A faixa nomeia o recorte em curso
              e traz o botão de desfazer, além do clique de novo na linha.

              ELA FICA ACIMA DAS DUAS TABELAS, e não dentro de uma delas, porque o recorte vale para
              o par: escolher um cargo muda o quadro de lojas, escolher uma loja muda o de cargos. */}
          {cruzamento && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--accent)] bg-[var(--sico)] px-3.5 py-2.5">
              <Icon name="filter" className="h-4 w-4 flex-none text-accent" />
              <span className="text-sm text-text">
                {cruzamento.tipo === "cargo" ? (
                  <>
                    Mostrando <strong>{cruzamento.rotulo}</strong> por loja / unidade. O quadro de
                    lojas abaixo conta só este cargo.
                  </>
                ) : (
                  <>
                    Mostrando os cargos de <strong>{cruzamento.rotulo}</strong>. O quadro de cargos
                    abaixo conta só esta loja.
                  </>
                )}
              </span>
              {/* A META NÃO CRUZA, e a faixa diz isso na hora em que o recorte por loja liga, em vez
                  de deixar o diretor descobrir pela célula vazia. */}
              {cruzamento.tipo === "loja" && (
                <span className="text-[12px] text-dim">
                  A coluna Vagas fica sem número: a meta do projeto é cadastrada por cargo, não por
                  loja.
                </span>
              )}
              <button
                type="button"
                onClick={() => setCruzamento(null)}
                className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] text-dim transition hover:border-[var(--border-strong)] hover:text-text"
              >
                Desfazer cruzamento
              </button>
            </div>
          )}

          {/* ── TABELA POR CARGO ────────────────────────────────────────── */}
          <GlassCard className="mb-5 overflow-hidden p-2">
            <div className="overflow-x-auto">
              {/* ORDEM DAS COLUNAS (decisão do diretor): Cargo, Vagas, Na Esteira, Concluídas, Em
                  Andamento, Faltam, Pausadas, Declínios. Faltam vem logo antes de Pausadas e Declínios
                  encerra a tabela, como pedido. Larguras somadas para aproveitar a faixa sem espremer
                  (§A.20); rola na horizontal abaixo do mínimo em vez de comprimir a coluna Cargo. */}
              <table className="ds-table w-full min-w-[920px] table-fixed">
                <thead>
                  <tr>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="cargo" className="w-[240px]">
                      Cargo
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="vagas" className="w-[110px]">
                      Vagas
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="vinculadas" className="w-[120px]">
                      Na Esteira
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="concluidas" className="w-[120px]">
                      Concluídas
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="emAndamento" className="w-[140px]">
                      Em Andamento
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="faltam" className="w-[120px]">
                      Faltam
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="pausadas" className="w-[110px]">
                      Pausadas
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ordCargo} chave="declinios" className="w-[110px]">
                      Declínios
                    </ColunaOrdenavel>
                  </tr>
                </thead>
                <tbody>
                  {ordCargo.itens.map((l) => {
                    const ativo = cruzamento?.tipo === "cargo" && cruzamento.id === l.cargoId;
                    return (
                    <tr
                      key={l.cargoId ?? "sem-cargo"}
                      onClick={() =>
                        alternarCruzamento({ tipo: "cargo", id: l.cargoId, rotulo: l.cargoNome })
                      }
                      className={cn(
                        "cursor-pointer transition",
                        ativo && "bg-[var(--sico)]",
                      )}
                      title={
                        ativo
                          ? "Clique de novo para desfazer o cruzamento."
                          : `Ver ${l.cargoNome} por loja / unidade`
                      }
                    >
                      <td className="font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {ativo && <Icon name="filter" className="h-3.5 w-3.5 flex-none text-accent" />}
                          {l.cargoNome}
                        </span>
                      </td>
                      {/* A META SOME NO RECORTE POR LOJA e a célula diz por quê: ela é cadastrada por
                          CARGO no projeto inteiro e não existe por loja. Repetir aqui a meta do
                          projeto afirmaria que aquela loja sozinha tem todas as vagas do cargo. */}
                      <td
                        className="text-center tabular-nums"
                        title={
                          l.vagas === null
                            ? "A meta é cadastrada por cargo no projeto inteiro, não por loja."
                            : undefined
                        }
                      >
                        {l.vagas === null ? (
                          <span className="text-[12px] text-faint">não informado</span>
                        ) : (
                          l.vagas
                        )}
                      </td>
                      <td className="text-center tabular-nums">{l.vinculadas}</td>
                      <td className="text-center font-semibold tabular-nums">{l.concluidas}</td>
                      <td className="text-center tabular-nums">{l.emAndamento}</td>
                      {/* NEGATIVO É INFORMAÇÃO, não defeito: o cargo tem mais gente do que vaga, e é
                          por não travar em zero que a coluna soma exatamente o total abaixo dela. O
                          título diz em palavras o que o sinal diz em número. */}
                      <td
                        className="text-center font-semibold tabular-nums"
                        style={l.faltam < 0 ? { color: "var(--accent)" } : undefined}
                        title={
                          l.faltam < 0
                            ? `${-l.faltam} além da meta deste cargo`
                            : undefined
                        }
                      >
                        {l.faltam}
                      </td>
                      <td className="text-center tabular-nums">{l.pausadas}</td>
                      <td className="text-center tabular-nums">{l.declinios}</td>
                    </tr>
                    );
                  })}
                  {/* O RODAPÉ SEGUE O RECORTE: com o cruzamento ligado ele soma as linhas visíveis,
                      e não os baldes do projeto, senão o total contradiria a tabela acima dele. */}
                  <tr className="bg-[var(--surface)]">
                    <td className="font-semibold">Total</td>
                    <td className="text-center font-semibold tabular-nums">
                      {cruzamento?.tipo === "loja" ? (
                        <span className="text-[12px] text-faint">não informado</span>
                      ) : (
                        dados.totais.vagas
                      )}
                    </td>
                    <td className="text-center font-semibold tabular-nums">
                      {totaisCargo.vinculadas}
                    </td>
                    <td className="text-center font-semibold tabular-nums">
                      {totaisCargo.concluidas}
                    </td>
                    <td className="text-center font-semibold tabular-nums">
                      {totaisCargo.emAndamento}
                    </td>
                    <td className="text-center font-semibold tabular-nums">{totaisCargo.faltam}</td>
                    <td className="text-center font-semibold tabular-nums">{totaisCargo.pausadas}</td>
                    <td className="text-center font-semibold tabular-nums">{totaisCargo.declinios}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* ── LOJAS / UNIDADES: O QUADRO COMPLETO POR STATUS ─────────────── */}
          {/* EVOLUÇÃO DO INDICADOR QUE JÁ ESTAVA AQUI (pedido do diretor, 27/08), e não uma seção
              nova: o card continua ABAIXO da tabela por cargo e ACIMA dos grupos, e nenhum outro
              gráfico da tela mudou de lugar, de tamanho ou de conteúdo (§A.26).

              A LISTA DE BARRAS VIROU TABELA, no molde exato do quadro de Cargos, E O CILINDRO FICOU:
              ele passou a morar DENTRO da coluna da loja, embaixo do nome. Era a peça que respondia
              "qual loja concentra a leva" antes de alguém ler número nenhum, e trocá-la por mais uma
              coluna de dígitos teria custado a leitura comparativa que o diretor aprovou. */}
          <GlassCard className="mb-5 overflow-hidden p-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                Lojas / Unidades
              </h3>
              <span
                className="text-sm text-dim"
                title="A loja cadastrada do cliente, vinculada à admissão. Cliente com um CNPJ só e várias lojas cadastra cada uma delas, e a admissão aponta para a certa. Quem ainda não tem loja vinculada cai em Sem Loja."
              >
                o plano: toda loja que recebeu meta neste projeto, inclusive as que ainda não têm
                ninguém alocado
              </span>
              {/* O TOTAL FICA À VISTA de propósito: ele é o mesmo número do balde "Total De Vagas Na
                  Esteira" lá em cima, e ver os dois na mesma tela é o que mostra que o recorte é um
                  só. É a prova que já existia, e as colunas novas não a tocaram. */}
              <span className="ml-auto text-sm text-dim">
                total na esteira:{" "}
                <span className="font-semibold tabular-nums text-text">{dados.totais.vinculadas}</span>
              </span>
            </div>

            {lojasPorMeta.length === 0 ? (
              <p className="py-8 text-center text-faint">
                Nenhuma loja com meta distribuída neste projeto. Distribua as vagas de um cargo entre
                as lojas no cadastro do projeto para acompanhar o plano por loja aqui.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {/* ORDEM DAS COLUNAS: a MESMA do quadro de Cargos, para as duas tabelas se lerem
                    igual. A coluna da loja é mais larga que a de cargo porque carrega o cilindro e o
                    peso embaixo do nome; as colunas de número repetem as larguras de lá (§A.12/§A.20)
                    e a tabela rola na horizontal abaixo do mínimo, em vez de espremer.
                    O `min-w` É A SOMA das larguras declaradas: abaixo disso o `table-fixed` encolhe
                    TODAS as colunas proporcionalmente e os títulos viram reticências, que foi o que
                    a coluna de Ações provocou na prova visual. Coluna nova entra somando aqui. */}
                <table className="ds-table w-full min-w-[1232px] table-fixed">
                  <thead>
                    <tr>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="loja" className="w-[230px]">
                        Loja / Unidade
                      </ColunaOrdenavel>
                      {/* §A.20, DEFEITO PEGO NA PROVA VISUAL: "TOTAL DE VAGAS" saiu cortado como
                          "TOTAL DE ...", porque o `ColunaOrdenavel` põe o rótulo num `truncate` e
                          numa coluna de 110px o texto não cabe em uma linha. O `whitespace-normal`
                          devolve ao rótulo o direito de quebrar em duas linhas, que é leitura;
                          reticências no nome da coluna é supressão, que é o que a regra proíbe. */}
                      {/* META da loja no projeto. Vazia onde o cargo não foi detalhado por loja. */}
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="meta" className="w-[90px]">
                        Meta
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="total" className="w-[110px]">
                        <span className="whitespace-normal">Total De Vagas</span>
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="vagas" className="w-[105px]">
                        <span className="whitespace-normal">Na Esteira</span>
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="concluidas" className="w-[130px]">
                        <span className="whitespace-normal">Concluídas</span>
                      </ColunaOrdenavel>
                      <ColunaOrdenavel
                        as="th"
                        ord={ordLoja}
                        chave="emAndamento"
                        className="w-[132px]"
                      >
                        <span className="whitespace-normal">Em Andamento</span>
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="faltam" className="w-[95px]">
                        Faltam
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="pausadas" className="w-[115px]">
                        <span className="whitespace-normal">Pausadas</span>
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordLoja} chave="declinios" className="w-[120px]">
                        <span className="whitespace-normal">Declínios</span>
                      </ColunaOrdenavel>
                      <th className="w-[105px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordLoja.itens.map((l) => (
                      <LinhaLoja
                        key={l.loja ?? "nao-informado"}
                        linha={l}
                        maior={maiorLoja}
                        total={dados.totais.vinculadas}
                        ativo={
                          cruzamento?.tipo === "loja" && cruzamento.loja === l.loja
                        }
                        onVerPessoas={() => setPessoasDe({ loja: l.loja })}
                        onClick={() =>
                          alternarCruzamento({
                            tipo: "loja",
                            loja: l.loja,
                            // §A.24: é rótulo de LINHA (uma tag que classifica o balde), então
                            // Title Case, e não o "não informado" de célula vazia.
                            rotulo: l.loja ?? "Sem Loja",
                          })
                        }
                      />
                    ))}
                    <tr className="bg-[var(--surface)]">
                      <td className="font-semibold">Total</td>
                      {/* META somada. Só as lojas COM meta entram: somar as sem meta como zero diria
                          que a meta total é menor do que é. */}
                      <td
                        className="text-center font-semibold tabular-nums"
                        title="Soma das metas das lojas que têm meta cadastrada neste projeto."
                      >
                        {totalLojas.meta || <span className="text-faint">não informado</span>}
                      </td>
                      <td className="text-center font-semibold tabular-nums">{totalLojas.total}</td>
                      {/* ESTA CÉLULA É A PROVA: ela é a soma das linhas E é o balde do topo, e o
                          título diz isso para quem passar o mouse conferindo. */}
                      <td
                        className="text-center font-semibold tabular-nums"
                        title="A soma das lojas é o mesmo número do balde Total De Vagas Na Esteira, no topo da tela: os dois saem do mesmo filtro."
                      >
                        {totalLojas.vagas}
                      </td>
                      <td className="text-center font-semibold tabular-nums">
                        {totalLojas.concluidas}
                      </td>
                      <td className="text-center font-semibold tabular-nums">
                        {totalLojas.emAndamento}
                      </td>
                      <td className="text-center font-semibold tabular-nums">{totalLojas.faltam}</td>
                      <td className="text-center font-semibold tabular-nums">
                        {totalLojas.pausadas}
                      </td>
                      <td className="text-center font-semibold tabular-nums">
                        {totalLojas.declinios}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* A NOTA DO DECLÍNIO FICA NA TELA, e não só no código: a coluna vem de outro recorte e
                não soma no Total, exatamente como no quadro de Cargos. Sem a frase, alguém somaria as
                colunas na mão, veria que não fecha e abriria um chamado. */}
            <p className="px-2 pb-1 pt-2.5 text-[12px] text-faint">
              Meta é quanto o projeto definiu para aquela loja, e fica em branco onde ninguém
              detalhou. Faltam é Meta menos Na Esteira, a mesma conta do quadro de Cargos. Total De
              Vagas é tudo que o projeto tem na loja: Na Esteira mais em banco mais os encerrados
              vinculados. Declínios vem do recorte do cliente no período, o mesmo do quadro de
              Cargos, e por isso é informação ao lado: não soma no Total nem em Faltam.
            </p>
          </GlassCard>

          {/* ── FORA DO PLANO: gente em loja sem meta, e gente sem loja ─────
              SÓ APARECE QUANDO EXISTE CASO (decisão do diretor). Projeto onde todo mundo está em
              loja com meta não ganha uma tabela vazia dizendo que está tudo certo: a ausência dela
              já diz isso.

              SEM as colunas Meta e Faltam, de propósito: aqui elas seriam vazias por definição, e
              coluna que nunca tem número é ruído. O que interessa nesta tabela é QUANTAS pessoas
              estão fora do plano e onde. */}
          {lojasForaDoPlano.length > 0 && (
            <GlassCard className="mt-4 p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="eyebrow !mb-0">Fora Do Plano</span>
                <span className="text-[13px] text-dim">
                  gente vinculada a este projeto que está em loja sem meta distribuída, ou sem loja
                  nenhuma. Não entra no plano acima
                </span>
                <span className="ml-auto text-sm text-dim">
                  na esteira:{" "}
                  <span className="font-semibold tabular-nums text-text">
                    {lojasForaDoPlano.reduce((a, l) => a + l.vagas, 0)}
                  </span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="ds-table w-full min-w-[1037px] table-fixed">
                  <thead>
                    <tr>
                      <th className="w-[230px]">Loja / Unidade</th>
                      <th className="w-[110px]">Total De Vagas</th>
                      <th className="w-[105px]">Na Esteira</th>
                      <th className="w-[130px]">Concluídas</th>
                      <th className="w-[132px]">Em Andamento</th>
                      <th className="w-[115px]">Pausadas</th>
                      <th className="w-[120px]">Declínios</th>
                      <th className="w-[105px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lojasForaDoPlano.map((l) => (
                      <tr key={l.loja ?? "sem-loja"}>
                        <td className={l.loja === null ? "font-semibold text-dim" : "font-semibold"}>
                          {l.loja ?? "Sem Loja"}
                        </td>
                        <td className="text-center tabular-nums">{l.total}</td>
                        <td className="text-center tabular-nums">{l.vagas}</td>
                        <td className="text-center font-semibold tabular-nums">{l.concluidas}</td>
                        <td className="text-center tabular-nums">{l.emAndamento}</td>
                        <td className="text-center tabular-nums">{l.pausadas}</td>
                        <td
                          className="text-center tabular-nums"
                          title="Declínios e rescisões do cliente no período do projeto. Vem do mesmo recorte do quadro de Cargos e não soma no Total."
                        >
                          {l.declinios}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            onClick={() => setPessoasDe({ loja: l.loja })}
                            className="text-accent hover:underline"
                          >
                            ver pessoas
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-2 pb-1 pt-2.5 text-[12px] text-faint">
                Loja aqui significa que alguém foi alocado nela sem que o projeto tivesse distribuído
                vagas para ela. Sem Loja significa que a pessoa ainda não tem loja na ficha. Nos dois
                casos a correção é a mesma: distribuir a meta no cadastro do projeto, ou vincular a
                loja certa na ficha da pessoa.
              </p>
            </GlassCard>
          )}

          {/* VER PESSOAS: o painel responde "quantos", e a pergunta seguinte é sempre "quem". */}
          {pessoasDe && dados && (
            <PessoasDaLojaModal
              projetoId={dados.projeto.id}
              loja={pessoasDe.loja}
              onClose={() => setPessoasDe(null)}
            />
          )}

          {/* ── ALERTA POR GRUPO (só para projeto que usa turmas) ────────── */}
          {dados.grupos.length > 0 && (
            <GlassCard className="overflow-hidden p-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Grupos De Entrada
                </h3>
                <span className="text-sm text-dim">
                  passada a data da turma, quem ainda não concluiu conta como atrasado
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="ds-table w-full min-w-[760px] table-fixed">
                  <thead>
                    <tr>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="grupo" className="w-[220px]">
                        Grupo
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="entrada" className="w-[130px]">
                        Entrada
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="vagas" className="w-[100px]">
                        Vagas
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="noGrupo" className="w-[110px]">
                        No Grupo
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="concluidas" className="w-[110px]">
                        Concluídas
                      </ColunaOrdenavel>
                      <ColunaOrdenavel as="th" ord={ordGrupo} chave="atrasadas" className="w-[120px]">
                        Atrasadas
                      </ColunaOrdenavel>
                    </tr>
                  </thead>
                  <tbody>
                    {ordGrupo.itens.map((g) => (
                      <tr key={g.id}>
                        <td className="font-semibold">{g.rotulo}</td>
                        <td className="text-center tabular-nums">{fmtData(g.dataEntrada)}</td>
                        <td className="text-center tabular-nums">{g.vagas}</td>
                        <td className="text-center tabular-nums">{g.vinculadas}</td>
                        <td className="text-center tabular-nums">{g.concluidas}</td>
                        <td className="text-center">
                          {g.atrasadas > 0 ? (
                            <span className="inline-flex justify-center">
                              <Pill tone="dg">{g.atrasadas} atrasada(s)</Pill>
                            </span>
                          ) : (
                            <span className="text-faint">{g.entrou ? "nenhuma" : "ainda no prazo"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* Leitura sobre leitura: os modais não buscam nada, só recortam o que a tela já tem. */}
      {modalDeclinios && dados && (
        <ModalDeclinios dados={dados} onClose={() => setModalDeclinios(false)} />
      )}
      {modalBanco && dados && <ModalBanco dados={dados} onClose={() => setModalBanco(false)} />}
    </>
  );
}

/**
 * Card de contagem: RÓTULO em cima, VALOR grande embaixo (layout invertido, decisão do diretor).
 *
 * O número embaixo e maior, com o card em `flex justify-between`, é o que faz o valor preencher o
 * espaço em vez de ficar comprimido no topo com o rótulo sobrando embaixo. A cor é a do balde quando
 * ele tem cor própria.
 */
function Balde({
  rotulo,
  valor,
  cor,
  onClick,
  dica,
  quebra,
}: {
  rotulo: string;
  valor: number;
  cor?: string;
  /** Só o balde que tem leitura por trás recebe clique. Sem `onClick` ele continua um bloco de texto. */
  onClick?: () => void;
  dica?: string;
  /**
   * Linha curta sob o número, para o balde dizer DE QUE é feito o próprio total. Existe por causa do
   * banco: o número grande conta só quem consome vaga, e sem esta linha não havia como o diretor ver
   * que há gente vinculada e viva fora da conta. Texto de apoio, não título (§A.24).
   */
  quebra?: string;
}) {
  const conteudo = (
    <div className="flex flex-1 flex-col justify-between gap-1.5">
      <div className="text-xs leading-snug text-dim">{rotulo}</div>
      <div>
        <div className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: cor }}>
          {valor}
        </div>
        {quebra && <div className="mt-1.5 text-[11px] leading-snug text-faint">{quebra}</div>}
      </div>
    </div>
  );
  const base =
    "flex min-h-[84px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5";

  // A dica vale mesmo sem clique: é onde "Cadastradas" e "Concluídas" explicam por que são baldes
  // diferentes, sem gastar linha de texto no card.
  if (!onClick)
    return (
      <div className={base} title={dica}>
        {conteudo}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      className={`${base} cursor-pointer text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface)]`}
    >
      {conteudo}
    </button>
  );
}

/** Metade de um card dividido: número menor e rótulo, opcionalmente clicável para abrir um modal. */
interface MeioBalde {
  rotulo: string;
  valor: number;
  cor: string;
  onClick?: () => void;
  dica?: string;
}

/**
 * CARD DIVIDIDO NO MEIO (decisão do diretor): dois desfechos que saem do preenchimento, empilhados no
 * espaço de um balde só, com uma divisória. Cada metade abre o próprio modal quando tem número. É um
 * card só porque declínio e banco são a mesma pergunta ("o que não está no preenchimento e por quê"),
 * lida de relance junto.
 */
function BaldeDividido({ cima, baixo }: { cima: MeioBalde; baixo: MeioBalde }) {
  const meio = (m: MeioBalde, borda: boolean) => {
    // Mesma inversão dos demais baldes: rótulo em cima, valor grande embaixo.
    const conteudo = (
      <div className="flex flex-1 flex-col justify-between gap-1">
        <div className="text-xs leading-snug text-dim">{m.rotulo}</div>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: m.cor }}>
          {m.valor}
        </div>
      </div>
    );
    const cls = `flex flex-1 flex-col px-3 py-2 ${borda ? "border-b border-[var(--border)]" : ""}`;
    if (!m.onClick)
      return (
        <div className={cls} title={m.dica}>
          {conteudo}
        </div>
      );
    return (
      <button
        type="button"
        onClick={m.onClick}
        title={m.dica}
        className={`${cls} w-full cursor-pointer text-left transition hover:bg-[var(--surface)]`}
      >
        {conteudo}
      </button>
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      {meio(cima, true)}
      {meio(baixo, false)}
    </div>
  );
}

/**
 * Uma loja / unidade como LINHA DE TABELA: o nome com o cilindro embaixo, e os baldes por status.
 *
 * ┌─ O CILINDRO FICOU, E ELE MUDOU DE LUGAR, NÃO DE PAPEL (pedido do diretor, 27/08) ──────────┐
 * │ A seção era uma lista de barras e virou tabela, no molde do quadro de Cargos. A barra podia  │
 * │ ter virado só mais uma coluna de número, e teria custado a leitura que o diretor aprovou:    │
 * │ comprimento responde "qual loja concentra a leva" antes de alguém ler dígito nenhum. Ela     │
 * │ passou a morar DENTRO da primeira coluna, embaixo do nome, onde continua comparando as lojas │
 * │ entre si sem disputar espaço com os sete números da direita.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ESCALA DA BARRA É O "NA ESTEIRA", e não o total da loja: é o mesmo número que a barra sempre
 * desenhou e o mesmo que soma o balde do topo. Trocar a medida por baixo do pano mudaria o que a
 * barra diz sem que ninguém tivesse pedido.
 *
 * SEM LOJA (admissão ainda não vinculada) é caso real e fica visível, com o número certo, em tom
 * neutro e no fim da lista: ele conta para o total, mas não é uma loja e não disputa o ranking.
 */
function LinhaLoja({
  linha,
  maior,
  total,
  ativo,
  onClick,
  onVerPessoas,
}: {
  linha: LinhaLoja;
  /** Maior loja da lista: a escala comum das barras. */
  maior: number;
  /** Total na esteira do projeto, para o peso de cada loja. */
  total: number;
  /** Abre o modal com quem está nesta loja. */
  onVerPessoas: () => void;
  /** Esta loja é a do cruzamento em curso? */
  ativo: boolean;
  onClick: () => void;
}) {
  const semLoja = linha.loja === null;
  // "Sem Loja" e não "não informado": esta linha é um BALDE com nome, o das admissões que ainda não
  // foram vinculadas a nenhuma loja, e hoje ela é a maior de todas. Nomear o balde é o que deixa
  // claro que aquilo é trabalho a fazer, não dado faltando numa célula.
  const rotulo = semLoja ? "Sem Loja" : linha.loja!;
  const peso = percentualDe(linha.vagas, total);
  // Piso de 3% para valor não nulo, o mesmo das barras por cargo: 1 vaga contra 300 desenharia uma
  // barra invisível, e a linha mentiria dizendo que não há ninguém naquela loja.
  const largura = linha.vagas <= 0 ? 0 : Math.max(3, Math.round((linha.vagas / Math.max(1, maior)) * 100));
  const cor = semLoja ? "var(--faint)" : "var(--accent)";

  return (
    <tr
      onClick={onClick}
      className={cn("cursor-pointer transition", ativo && "bg-[var(--sico)]")}
      title={ativo ? "Clique de novo para desfazer o cruzamento." : `Ver os cargos de ${rotulo}`}
    >
      <td>
        <div className="flex items-baseline gap-2">
          {ativo && <Icon name="filter" className="h-3.5 w-3.5 flex-none text-accent" />}
          <span
            className={`min-w-0 flex-1 truncate text-sm font-semibold ${semLoja ? "text-faint" : "text-text"}`}
            title={rotulo}
          >
            {rotulo}
          </span>
          {/* Peso no projeto: 8 vagas numa leva de 20 é outra história que 8 numa leva de 300.
              `whitespace-nowrap` porque a mesma frase estava quebrando em duas linhas em umas
              colunas e não em outras, e a lista ficava com as linhas em alturas diferentes (§A.20). */}
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-faint">
            {total > 0 ? `${peso}% do projeto` : "sem vínculo"}
          </span>
        </div>
        <div className="mt-1.5 h-[10px] w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
          {largura > 0 && (
            <div
              className="h-full rounded-full"
              style={{
                width: `${largura}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 45%, transparent), ${cor})`,
              }}
            />
          )}
        </div>
      </td>
      {/* META da loja. VAZIA quando o cargo não foi detalhado por loja neste projeto: zero diria
          "não falta ninguém", e a verdade é que ninguém definiu meta aqui. */}
      <td className="text-center tabular-nums">
        {linha.meta ?? <span className="text-faint">não informado</span>}
      </td>
      <td className="text-center tabular-nums">{linha.total}</td>
      <td className="text-center tabular-nums">{linha.vagas}</td>
      <td className="text-center font-semibold tabular-nums">{linha.concluidas}</td>
      <td className="text-center tabular-nums">{linha.emAndamento}</td>
      {/* FALTAM = meta menos na esteira, a MESMA conta do quadro de Cargos. NEGATIVO É INFORMAÇÃO,
          não defeito: não travar em zero é o que faz a coluna somar exatamente o total abaixo dela.
          Sem meta, sem faltam. */}
      <td
        className="text-center font-semibold tabular-nums"
        style={linha.faltam !== null && linha.faltam < 0 ? { color: "var(--accent)" } : undefined}
        title={
          linha.faltam === null
            ? "Esta loja não tem meta cadastrada neste projeto."
            : linha.faltam < 0
              ? `${-linha.faltam} além da meta desta loja`
              : `${linha.faltam} para bater a meta desta loja`
        }
      >
        {linha.faltam ?? <span className="text-faint">não informado</span>}
      </td>
      <td className="text-center tabular-nums">{linha.pausadas}</td>
      {/* O DECLÍNIO É DE OUTRO RECORTE (cliente + período), como no quadro de Cargos: ele não soma no
          Total desta linha, e o título diz isso a quem passar o mouse conferindo a conta. */}
      <td
        className="text-center tabular-nums"
        title="Declínios e rescisões do cliente no período do projeto, nesta loja. Vem do mesmo recorte do quadro de Cargos e não soma no Total De Vagas."
      >
        {linha.declinios}
      </td>
      {/* VER PESSOAS: a pergunta que sempre vem depois do número. O clique NÃO propaga para a linha,
          senão abrir a lista de gente também acionaria o cruzamento por loja. */}
      <td className="whitespace-nowrap text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onVerPessoas();
          }}
          className="text-accent hover:underline"
        >
          ver pessoas
        </button>
      </td>
    </tr>
  );
}

/**
 * MODAL EM BANCO (decisão do diretor): a quantidade de admissões em banco por cargo.
 *
 * Admissão de banco é a que fica aguardando para ser chamada, então saiu do preenchimento (não é vaga
 * ocupada) e ganhou leitura própria. Como o modal de declínios, recorta o mesmo GET que já desenhou a
 * tela, sem consulta nova, então tela e modal não têm como discordar. §A.6: contagem por cargo, sem
 * nome e sem CPF.
 */
function ModalBanco({ dados, onClose }: { dados: Analise; onClose: () => void }) {
  const ranking = dados.porCargo
    .filter((l) => l.emBanco > 0)
    .sort((a, b) => b.emBanco - a.emBanco || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"));
  const maior = ranking[0]?.emBanco ?? 0;

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Admissões Em Banco">
      <h2 className="mb-1 text-[19px] font-semibold text-text">Admissões Em Banco</h2>
      <p className="mb-4 text-sm text-dim">
        {dados.projeto.nome}, quantas admissões estão em banco aguardando, por cargo. Elas não contam
        no preenchimento das vagas.
      </p>

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <span
          className="text-[34px] font-semibold leading-none tabular-nums"
          style={{ color: "var(--warn)" }}
        >
          {dados.totais.emBanco}
        </span>
        <span className="ml-3 text-sm text-dim">
          {dados.totais.emBanco === 1 ? "admissão em banco" : "admissões em banco"} no projeto
        </span>
      </div>

      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
        Em Banco Por Cargo
      </h3>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-faint">Nenhuma admissão em banco neste projeto.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ranking.map((l) => (
            <div key={l.cargoId ?? l.cargoNome}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={l.cargoNome}>
                  {l.cargoNome}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                  {l.emBanco}
                </span>
              </div>
              <div
                className="mt-1 h-[12px] w-full overflow-hidden rounded-full"
                style={{ background: TRILHO }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((l.emBanco / Math.max(1, maior)) * 100))}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--warn) 45%, transparent), var(--warn))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
