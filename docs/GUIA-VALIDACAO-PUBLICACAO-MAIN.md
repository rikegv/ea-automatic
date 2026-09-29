# GUIA DE VALIDAÇÃO DA PUBLICAÇÃO, para o diretor conferir na tela

**Produção: `http://10.18.117.235:3010`** (é a 3010, não a 3120: a 3120 é homologação).
Publicado em 29/09/2026. Release `ea-release-portal`, commit `1ae034f`.
O release antigo (`ea-release-ingestao`, `d845232`) **continua intacto como rollback**.

Entre com o seu usuário Super Admin. Se algo abaixo não aparecer, avise: a maior parte do que é
novo depende de **liberação de menu**, que é decisão sua e não foi feita pela fábrica (§A.23).

---

## 1. O que já está na tela sem depender de nada

| Onde | O que conferir |
|---|---|
| **Central De Ajuda** (`/ajuda`, item "Ajuda" na barra lateral, abaixo do Menu Gerencial) | Abre o manual. 37 artigos, 98 prints. A barra lateral desenha o item para todos, como você pediu |
| **Menu Gerencial** (`/admin`) | O card da Central De Ajuda aparece |
| **Esteira**, aba com credencial do iFractal | O campo de **senha agora vem mascarado** (era texto claro). Decisão sua de 28/09 |
| **Tela de Usuários**, botão de configurar menus | As caixas de menu que **não podem** ser concedidas a um papel agora vêm **desabilitadas com o motivo escrito**. Antes a caixa aparecia marcável, você marcava, a tela salvava sem reclamar e o servidor descartava em silêncio |
| **Portal Do Candidato** (`/portal`) | A tela do candidato abre. Ainda **só dentro da rede**: o acesso público depende do Fernando |

## 2. O que entrou e espera VOCÊ liberar o menu

**14 menus estão registrados com ZERO concessão**, esperando sua decisão na tela de Usuários.
A fábrica registrou para eles existirem e serem selecionáveis, e parou aí. Os principais:

- `ajuda` (Central De Ajuda), `portal-links` (Portal Do Candidato), `dicas-documento`
- os 8 catálogos de A&S: Comerciais, Segmentos, Linhas De Serviço, Status Da Vaga,
  Etapas Do Funil, Motivos De Descarte, Motivos De Cancelamento, Motivos De Reenvio
- `as-vagas-revisao` (Liberar Vaga), `entradas-pandape`, `menu-areas`

**ATENÇÃO, e isto é armadilha conhecida:** a tela de Usuários salva por **substituição**. Quem
estiver com a tela aberta desde antes da publicação e salvar agora **apaga os menus novos sem
perceber**, porque a página manda a lista antiga. Recarregue a tela antes de salvar.

## 3. O que subiu e continua DESLIGADO de propósito

| Frente | Estado | O que falta |
|---|---|---|
| **Ingestão do Pandapé** | INERTE. O log do backend diz: "Varredura do Pandapé INERTE" | **Você** decide a data de corte (`PANDAPE_VARREDURA_DATA_CORTE`). Sem ela nenhuma inscrição é lida, e é assim de propósito: um padrão colheria dado pessoal de 137 mil pessoas de saída |
| **Ingestão do Digai** | INERTE. Log: "ingestao INERTE", "polling DESLIGADO" | Sua ordem para ligar, mais o token no `.env` |
| **G.I** | INERTE. Nenhuma variável `GI_*` em produção | Credenciais e sua ordem |
| **Porta de e-mail do Portal** (candidato sem CPF) | **NÃO SUBIU** | Está bloqueada pelo correio. Recomendação da fábrica: manter fora até o correio destravar |
| **Leitor de documento do Portal pela IA** | INERTE por configuração (`PORTAL_LEITOR_URL` ausente) | Sua decisão de ligar. O serviço isolado existe e responde, só não está ligado ao backend |

## 4. Três coisas que a fábrica quer que você decida

1. **Os 98 prints da Central De Ajuda são servidos SEM login** (49 MB em `/ajuda/...`). O conteúdo é
   de base sintética, provado: candidatos "SIMULADO ALFA", CPFs da série 999, e-mails
   `@exemplo.invalid`. Nenhum dado de pessoa real. Mas eles expõem a **estrutura da interface** e
   **nome de cliente** (BLUE SKIES, HAOC, MEIWA, WURTH). Quem alcança a 3010 vê. Fechar atrás de
   login é trabalho pequeno: quer que a fábrica feche?
2. **O limitador de ritmo do Portal nasce inerte no balde por IP**, e isso é correto e fail-closed:
   sem o Apache da barreira na frente, a cadeia tem um salto só e o sistema se recusa a confiar num
   IP que pode ser mentira. Antes de o Portal ficar público, as duas variáveis precisam ser
   preenchidas. Não é pendência de hoje, é pendência da virada pública.
3. **O lint global do repositório tem 13 erros pré-existentes**, nenhum das frentes desta subida.
   Três deles são só um plugin do lint que não está instalado. Zerar isso é uma frente de meia hora:
   quer na fila?

## 5. Se algo estiver errado: o rollback

Um comando, e produção volta ao release de 24/09. A fábrica executa em menos de um minuto.
O banco **não volta** junto: as 16 migrations são todas aditivas (tabela e coluna novas, nenhuma
remoção), então o código antigo continua funcionando sobre o banco novo. Backup do banco de antes da
publicação guardado em `~/backups/ea-prod/`.
