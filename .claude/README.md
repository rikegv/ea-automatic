# .claude — fábrica do EA AUTOMATIC (Parte B)

Este diretório materializa a **Parte B** da constituição (CLAUDE.md): a fábrica de 8 agentes,
o gate de deploy e as configurações do harness.

- `agents/` — os **8 agentes** da fábrica (papéis herdados do CentraAtend, contexto do EA).
  O **coordenador** é o agente de entrada/despacho: lê o CLAUDE.md a cada sessão e articula os
  demais. Ele é o ponto de partida convencional desta fábrica.
- `settings.json` — registra o **hook `PreToolUse`** que NASCE amarrado a `scripts/gate-deploy.sh`
  (a correção do diagnóstico CentraAtend, §A.7) e o allowlist de permissões.
- `state/` — flags `READY_*` que liberam o gate (vazio por padrão = trava ativa).

> Nota: o Claude Code não expõe uma chave em `settings.json` para fixar um subagente "default";
> a convenção "coordenador como ponto de entrada" está codificada no agente `coordenador` e nesta
> documentação. Ao despachar trabalho, comece pelo coordenador.
