---
description: Inicia a spec SDD de um refinamento (Crafting Table) — passo 0 em diante
argument-hint: <pasta do refinamento> [repositório]
---

Inicie a spec SDD deste refinamento: **$ARGUMENTS**

O primeiro argumento é a pasta do ticket (`~/.claude/tickets/<CHAVE>`) ou do refinamento (`~/.claude/refinamentos/<id>`). O segundo, se houver, é a raiz do
repositório onde a spec vai morar. Siga a skill `sdd` (protocolo de início): rode
`${CLAUDE_PLUGIN_ROOT}/bin/sdd-state init --ref <pasta> --repo <repositório>` e depois o protocolo de retomada.
