# Plano: os 6 bugs de tela do Portal do Candidato

> Plano de correcao (arquiteto). Homologacao. A raiz e comum a 3 dos bugs, e a correcao toca §A.6
> (persistir o que a IA leu), por isso as 3 decisoes do diretor no fim.

## A RAIZ (confirmada, com arquivo:linha)

O resultado da auditoria do Portal (os campos que a IA leu + o veredito) e EFEMERO. O `confirmar`
devolve isso UMA vez em tempo real, a tela guarda so no estado React `envio`, e nada disso e
persistido nem volta pelo `carregarTrilha`. Toda navegacao ou refresh zera `envio` e a tela regride
para o estado do documento no banco, que e `AGUARDANDO_AUDITORIA`.

Dois refinos que mudam o desenho:
- **A auditoria do Portal e SINCRONA** (roda no ciclo do `confirmar`, `domain/portal-caminho-arquivo.ts:224-241`).
  Nao ha nada chegando "depois", entao POLLING e a ferramenta errada. A cura e persistir e devolver
  pela trilha.
- **O reprovado fica preso em "em analise" para sempre.** O Portal nunca escreve `INCONFORME`; a
  reprovacao so carimba `reprovado_em` na credencial. E `estadoDoPasso` mapeia
  `AGUARDANDO_AUDITORIA -> EM_ANALISE` antes de tudo (`portal-documentos.service.ts:377`). Entao um
  documento reprovado, ao recarregar, aparece como "em analise", nunca como "ajustar". Isso e o
  rosto duravel dos bugs 5 e 6, e trava o bug 3 (substituir).

Bug 2 (refresh expulsa): o fragmento `#t=` e apagado da barra no primeiro render (`page.tsx:402-404`,
§A.6) e a sessao vive so em memoria React. Refresh = sem link e sem sessao = expulso.
Bug 1 (termo reaparece): `aceitouTermo` e estado React nao persistido (`page.tsx:361`).
Bug 3 (substituir): a guarda de servidor JA existe (arquivo unico: reprovado permite novo envio,
aprovado bloqueia). Falta a casa reaparecer como "ajustar", que o fix de estado resolve.

## A CORRECAO

- **Nova tabela `portal_conferencia`** (uma linha por admissao+tipo): os campos que a IA leu + o
  veredito (frase da lista fechada do EA, sem texto cru do modelo) + **TTL 48h** (expurgo, mesmo
  principio da staging efemera) + `confirmado_em`. Escrita no `confirmar`; na confirmacao do
  candidato os `campos` sao ANULADOS (os valores confirmados ja vivem em `admissao_dados_gi`).
- **A trilha passa a devolver `conferencia` por passo**, entao a tela reconstroi "conferir" /
  "ajustar" / "aceito" ao navegar e ao recarregar, sem depender do estado volatil. Resolve 4, 5, 6.
- **`estadoDoPasso` ganha o sinal "reprovado no Portal"** e devolve "ajustar" em vez de "em analise".
  Reabre a casa de substituir. Resolve 3.
- **Sessao de 30min (bilhete SEM CPF/nome) no `sessionStorage`** da aba, para o refresh retomar.
  Resolve 2 (com um residuo: refresh depois de 30min ainda pede reabrir o link).
- **Nova tabela `portal_termo_aceite`** (= registro de consentimento LGPD) + `POST /portal/termo`.
  A trilha devolve `termoAceito`, a tela pula a tela do termo na volta. Resolve 1.
- **ai-service: nenhuma mudanca.** A persistencia e 100% backend.

## AS 3 DECISOES DO DIRETOR

1. **Refresh (bug 2):** guardar a sessao curta de 30min (sem CPF/nome) no `sessionStorage` da aba
   (recomendado), aceitando que refresh DEPOIS de 30min ainda pede reabrir o link. A alternativa
   (guardar o link de 72h no aparelho) expoe a credencial mais longa: o plano recomenda NAO.
2. **Reverter o veto V12 (persistir o que a IA leu):** para a tela mostrar o dado ao retomar (o que
   voce pediu), o resultado da IA precisa ser guardado, com TTL 48h, CPF fora de log, campos
   anulados apos a confirmacao, e o `seguranca` co-assinando. Isso reverte um guard que dizia "a
   sugestao nunca e persistida". Precisa da sua ratificacao.
3. **Allowlist de `/portal/termo` com o Fernando (infra):** a rota nova de gravar o aceite entra na
   allowlist da barreira quando o portal for ao ar (como as outras `/portal/*`). Nao trava o build
   nem a homolog; e infra futura.
