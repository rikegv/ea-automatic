# .claude/state — flags de liberação do gate

Este diretório guarda as **flags `READY_*`** consumidas por `scripts/gate-deploy.sh`
(hook PreToolUse em `settings.json`). Sem uma flag `READY_*` aqui, os verbos de
deploy/push (`git push`, `deploy`, `kubectl apply`, `docker push`) são **bloqueados**.

- Criar liberação deliberada: `touch .claude/state/READY_<motivo>` (após validação do diretor).
- Remover após o push: as flags são locais e **nunca** versionadas (ver `.gitignore`).

Em estado normal (commit zero) este diretório fica **vazio** de flags — a trava está ativa.
