# Suporte a outros agentes de IA: estimativa e mapa de acoplamento ao Claude Code

Este documento tem duas partes:

1. **Estimativa de esforço** para que a Crafting Table funcione com um agente de IA diferente do Claude Code.
2. **Mapa de uso do Claude Code**, ou seja, onde o repositório depende do Claude Code hoje. A estimativa foi feita a partir dele.

---

# Parte 1: Estimativa de esforço

Premissas:

- Um dev sênior trabalhando sozinho, que já conhece este código (não está começando do zero).
- Cobre só a infraestrutura "manifesto neutro + adaptadores".
- A reescrita cosmética de cada tela isolada é um item à parte.

| Bloco (do mapa) | O que precisa ser feito | Tamanho | Estimativa |
|---|---|---|---|
| 6 — Settings/UI | Destravar `craftingTable.agente` e tornar modelo/esforço condicionais | — | Já feito (sessão anterior) |
| 1 — Executor do agente | Extrair uma interface neutra (`executor.rodar({prompt, ferramentas, pastas, sessão, modelo}) → eventos`) por trás do `spawn(claude, ...)` atual. Toca `maestro.js`, 5 módulos (orquestrador, mergulho, reproducao, qa.js, acoes.js) e 2 testes | M | 1–2 semanas |
| 3 — Plugins/skills → "método" direto | Separar o conteúdo de SDD/mapa/foco/QA do empacotamento como plugin do Claude Code, para injetá-lo como prompt quando o agente não for o Claude | M | 1–2 semanas |
| 5 — Armazenamento (`~/.claude/...`) | Adaptador por agente para o lugar onde ficam ticket, documento e histórico | S–M | 3–5 dias |
| 7 — Textos cosméticos ("o Claude faz X") | Trocar ~60–80 strings por `agente.nome` ou termo genérico e ajustar os 3 testes que fixam o texto exato | S | 2–3 dias |
| 9 — `instalar.sh` + docs | Tornar a instalação condicional ao agente escolhido | S | 1–2 dias |
| 8 — `sdd-state` | Expor como function-call nativa do novo agente, em vez de skill + Bash do Claude (só por instrução de prompt também funciona, mas é mais frágil) | S–M | 2–4 dias |
| 2 — Protocolo de hooks (aprovação assíncrona) | Substituir o truque "hook `Stop` sai com código 2" por outro mecanismo de pausar e retomar (fila, webhook, polling). Não há equivalente conhecido no agente alvo | L–XL | 2–4 semanas, **alto risco** |
| 4 — Integração com a extensão oficial do Claude Code no VS Code | Fora de escopo nesta fase. Só é possível se o outro agente tiver uma extensão de VS Code equivalente, o que normalmente não acontece | — | Provavelmente descartado para o 1º agente alternativo; não estimado |
| 1º adaptador real de um agente concreto | Depende 100% do agente escolhido (Codex CLI? Gemini CLI? API HTTP direta?): traduzir tool-calling, parsing de stream e permissões | XL | Não dá para estimar antes de escolher o agente |

## Total

Para ter algo rodando de ponta a ponta com um segundo agente, numa versão reduzida (sem replicar 100% a aprovação assíncrona nem a conversa interativa), a ordem de grandeza é de **6 a 10 semanas de um dev sênior trabalhando sozinho**.

Isso pressupõe aceitar que a primeira versão não terá o fluxo "pausa e retoma sozinho depois da aprovação humana" (bloco 2), que é o item de maior risco e não tem solução óbvia.

## Dois pontos que mudam muito a conta

1. **Qual é, concretamente, o agente alternativo.** Se ele não suporta tool-calling, streaming ou sessão contínua no mesmo nível do Claude Code, parte do bloco 1 deixa de ser "dá mais trabalho" e passa a ser "não dá para fazer igual".
2. **O bloco 2 (retomar uma conversa pausada)** é o único item sem uma solução pronta para sugerir. Provavelmente exige redesenhar a própria UX de aprovação, por exemplo trocar "a conversa acorda sozinha" por "o usuário reabre manualmente". Essa é uma decisão de produto, não só técnica.

---

# Parte 2: Mapa de uso do Claude Code na Crafting Table

Mapeamento read-only de tudo que hoje depende ou menciona o Claude Code no repositório `/home/maxsuel/Crafting-Table`, como base para o trabalho futuro de permitir conectar a extensão a "um agente de IA de sua preferência". Nenhum arquivo do repositório foi alterado.

Convenções: **[PROFUNDA]** = dependência funcional que só existe por causa do Claude Code (protocolo, CLI, hooks, plugins). **[SUPERFICIAL]** = texto/rótulo cosmético, fácil de trocar por um nome genérico.

---

## 1. Execução do agente: spawn do CLI `claude` **[PROFUNDA]**

O coração do modo refinamento (e de Mergulho/QA) é rodar o binário `claude` como subprocesso (`claude -p`, uma execução por etapa), lendo a saída `stream-json` evento a evento.

| Arquivo:linha | Trecho | Nota de generalização |
|---|---|---|
| `extensao/painel/maestro.js:20` | `const claudeBin = () => [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'].find((p) => fs.existsSync(p)) \|\| 'claude';` | Precisa virar uma camada de "executor de agente" plugável: cada agente define como é localizado o binário (ou endpoint de API) e como é invocado. |
| `extensao/painel/maestro.js:136-138` | `const args = ['-p', prompt + PEDIDO_DECISAO, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', ...]; const p = spawn(claudeBin(), args, ...)` | Flags (`-p`, `--output-format stream-json`, `--permission-mode`, `--allowedTools`, `--resume`) são todas específicas do Claude Code CLI. Um adaptador por agente precisaria traduzir { prompt, ferramentas permitidas, continuar sessão } para a CLI/API de cada agente. |
| `extensao/painel/maestro.js:16` | `vivo(pid)` confere `/proc/${pid}/cmdline` e `path.basename(a) === 'claude'` para saber se o processo ainda é um `claude` | Checagem de processo vivo amarrada ao nome do binário. |
| `extensao/painel/maestro.js:115-124` | `linhas(e)` faz parsing do formato de evento `stream-json` do Claude Code (`type: 'assistant'|'system'|'user'|'result'`, `subtype: 'init'|'permission_denied'`, `tool_use`, `is_error`, `total_cost_usd`) | Formato de evento é 100% proprietário do Claude Code CLI; outro agente teria outro protocolo de streaming (ou nenhum). |
| `extensao/painel/maestro.js:69-91` | `linhaFerramenta(f)` traduz nomes de ferramenta do Claude (`Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `Skill`, `Bash`, `ToolSearch`, `TodoWrite`) em frases para a aba "Ao vivo" | Nomes de ferramentas são os do Claude Code; outro agente usa outro conjunto/nomenclatura de tools. |
| `extensao/painel/maestro.js:172` | `module.exports = { ..., claudeBin, ... }` | `claudeBin` é consumido por `configuracao.js` para `claude --version`, `claude plugin ...`. |

Esse mesmo padrão de spawn (`claude -p` com `--settings`, `--plugin-dir`, `--add-dir`, `--model`, `--effort`/`--effort` via `cfg().get('modelo')`/`esforco`) se repete em:

- `extensao/refinamento/orquestrador.js:44-54` (`etapa()`, refinamento)
- `extensao/incidentes/mergulho.js:136-141` (Mergulho, etapas 1-4)
- `extensao/incidentes/reproducao.js:92-96` (Mergulho, etapa 5: `d.claude(opts)`)
- `extensao/qa/qa.js:382-386` (`claude(dir, opts, d)`, execução de QA)
- `extensao/qa/acoes.js:20, 93, 112, 151` (flags `--settings`, `--add-dir`, `--model`)
- `extensao/incidentes/teste-reproducao.js`, `extensao/qa/teste-qa.js` (testes que simulam esse contrato)

Flags recorrentes e o que fazem (todas específicas do Claude Code CLI):

| Flag | Onde | Para que serve hoje |
|---|---|---|
| `--model` | orquestrador.js:47, mergulho.js:139, reproducao.js:93, qa/acoes.js:21/93 | Lê `craftingTable.modelo` |
| `--effort` | orquestrador.js:47 | Lê `craftingTable.esforco` |
| `--plugin-dir` | orquestrador.js:48, mergulho.js:139, reproducao.js (via mapa) | Carrega plugins locais da extensão (`foco`, `mapa`) sem precisar instalá-los globalmente |
| `--settings '{"enabledPlugins":{"i-have-adhd@i-have-adhd":false}}'` | orquestrador.js:48, mergulho.js:139, reproducao.js:93, qa/acoes.js:20/112/151, qa/acoes.js:112 | Desliga um plugin de terceiro específico (`i-have-adhd`) nas execuções em segundo plano |
| `--add-dir` | vários | Libera pastas (ticket, repositórios de código) para leitura |
| `--allowedTools` / `ferramentas` | maestro.js:137, orquestrador.js:28-30, mergulho.js:54-55, reproducao.js:13, qa.js:341/349-350/510-512 | Lista de ferramentas liberadas por etapa, usando a sintaxe do Claude Code (`Bash(cmd:*)`, `mcp__claude_ai_Atlassian__*`) |
| `--resume <sid>` | maestro.js:137 | Continua a mesma sessão/conversa |
| `--permission-mode acceptEdits` | maestro.js:136 | Modo de permissão do Claude Code |

**Nota de generalização geral do bloco 1**: este é o maior bloco de trabalho. Qualquer agente alternativo (outro CLI, uma API HTTP, etc.) não tem os mesmos conceitos de "--plugin-dir", "--allowedTools", "--settings enabledPlugins" ou o mesmo formato de stream-json. Seria necessário desenhar uma interface neutra tipo `executor.rodar({ prompt, ferramentasPermitidas, pastasLiberadas, continuarSessao, modelo, esforco }) -> eventos{tipo,texto}` e implementar um adaptador Claude Code (o que existe hoje) e, no futuro, adaptadores para outros agentes.

---

## 2. Hooks do Claude Code (protocolo de hooks) **[PROFUNDA]**

Toda a ponte "o que o Claude fez agora aparece na extensão" depende do protocolo de hooks do Claude Code: eventos (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PreToolUse`, `Stop`, `Notification`), JSON de entrada pelo stdin, JSON de saída específico (`hookSpecificOutput`, `additionalContext`, `permissionDecision`), `asyncRewake` e o truque de **sair com código 2** para "acordar" o Claude numa conversa já terminada.

| Arquivo:linha | Trecho | Nota |
|---|---|---|
| `hooks/documentos.py:86-95` | `SessionStart` devolve `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ...}}` para avisar onde salvar documentos | Mecanismo de "injetar contexto na sessão" é específico do Claude Code; outro agente precisaria de outro canal (ex.: prompt de sistema custom). |
| `hooks/decisoes.py:48-66` | Lê `tool_name == "AskUserQuestion"` e o formato de `tool_response` (`answers`, `annotations`, `questions`) | `AskUserQuestion` é uma ferramenta nativa do Claude Code; seu formato de resposta é proprietário. |
| `hooks/decisoes.py:109-112` | Chama `["claude", "-p", "--model", "haiku", "--no-session-persistence", "--settings", '{"disableAllHooks": true}']` para classificar se a mensagem do usuário é uma "decisão" | Dependência recursiva: um hook do Claude Code chama o próprio CLI do Claude (modelo Haiku) como "juiz". Outro agente não teria um "Haiku" equivalente nem essa flag. |
| `hooks/crafting-testes.py:1-220` | Ponte com a skill `testes-funcionais`; lê `tool_input.command`, `hook_event_name`, `run_in_background` | Pressupõe o formato de evento do Claude Code e a skill (ver bloco 3). |
| `hooks/notificacoes.py:18-38` | Lê `stop_hook_active`, `notification_type == "idle_prompt"`, `last_assistant_message` | Campos específicos dos eventos `Stop`/`Notification` do Claude Code. |
| `plugin/plugins/sdd/hooks/guarda.js:9-12` | `negar()` devolve `{hookSpecificOutput:{hookEventName:'PreToolUse', permissionDecision:'deny', permissionDecisionReason:...}}` | Formato de "negar uma ação" do `PreToolUse` é da API de hooks do Claude Code. |
| `plugin/plugins/sdd/hooks/guarda.js:100-127` | Vigia em `Stop`/`SessionStart` com `asyncRewake`, grava `.vigia`/`.vigia.log`, e ao detectar aprovação humana faz `process.stderr.write(mensagem); process.exit(2)` | **Mecanismo central do fluxo "Dar início / Aprovar"**: sair com código 2 e escrever no stderr é a forma documentada do Claude Code de reabrir/"acordar" uma conversa parada. Não existe equivalente genérico; um agente diferente precisaria de outro jeito de retomar uma tarefa assíncrona (ex.: webhook, fila, polling). |
| `extensao/plugins/foco/hooks/regras.js:2`, `medir.js:2-3` | `SessionStart` entrega regras (texto PT-BR) "ao Claude"; `PostToolUse` mede `.md`/`.txt` e devolve código 2 para o Claude "ler" o aviso | Mesmo truque de "código 2 = o modelo lê a mensagem" do Claude Code. |
| `plugin/plugins/sdd/hooks/hooks.json`, `extensao/plugins/foco/hooks/hooks.json` | Declaração de hooks (`matcher`, `hooks[].type:"command"`, `${CLAUDE_PLUGIN_ROOT}`) | Schema de `hooks.json` e variável `CLAUDE_PLUGIN_ROOT` são do formato de plugin do Claude Code. |
| `instalar.sh:39-73` | Registra os hooks em `~/.claude/settings.json` (array `hooks.<Evento>[].hooks[]`, matcher, `async`, `timeout`, `statusMessage`) | Formato de `settings.json` do Claude Code. |

**Nota de generalização geral do bloco 2**: isto é a dependência mais profunda e mais difícil de generalizar. O "acordar a conversa depois de uma aprovação humana" (via `exit 2` + stderr num hook `Stop`) é um mecanismo só do Claude Code. Um agente diferente que não tenha um conceito equivalente de hooks assíncronos exigiria repensar como a extensão retoma um fluxo pausado (ex.: reenviar o prompt inteiro, manter o processo vivo esperando um sinal, etc.).

---

## 3. Plugins, skills e marketplace do Claude Code **[PROFUNDA]**

| Item | Arquivo:linha | Nota |
|---|---|---|
| Plugin `sdd@crafting-local` | `plugin/plugins/sdd/**`, instalado via `claude plugin marketplace add/install` (`instalar.sh:36-37`, `configuracao.js:38`) | O fluxo de 7 passos do SDD (specs, estado, aprovação) é implementado como **plugin do Claude Code** com comandos (`/sdd:iniciar`, `/sdd:continuar`) e skill (`sdd`) que só o Claude Code sabe carregar/invocar. Generalizar exige decidir se o "método SDD" vira algo embutido na própria extensão (prompt fixo) ou se outros agentes tem conceito equivalente de plugin/skill. |
| Plugin local `mapa` | `extensao/plugins/mapa/**`, carregado via `--plugin-dir` (não instalado globalmente) | Skill `mapear` (mapeamento de código/banco) e bins (`mapa-git`, `mapa-conferir`, `mapa-db`) — ferramentas chamadas via `Bash(...)` dentro das regras do Claude Code. |
| Plugin local `foco` | `extensao/plugins/foco/**` | Hooks que impõem "texto curto, PT-BR" via `SessionStart`/`PostToolUse` — mecanismo específico de hooks (ver bloco 2). |
| Plugin de terceiro `fcx-qa-test-planning@fcxlabs` | `configuracao.js:41`, `orquestrador.js:178-182`, `qa.js:500-512` | Lido via instalação do plugin (`installed_plugins.json`) e invocado como skill (`jira-qa-planner`, `test-estimation`) dentro do prompt (`promptCriar`, linha 500-503 de qa.js: `/fcx-qa-test-planning:jira-qa-planner ...`). Depende do marketplace do Claude Code (`MKT_FC`, `configuracao.js:117-137, 180-206`). |
| Skill `testes-funcionais` | `configuracao.js:42`, `qa.js:190-220, 327-350` | Mora em `~/.claude/skills/testes-funcionais`; a extensão lê arquivos dela diretamente (`SKILL.md`, `references/*.md`, `assets/backend/preparar-ambiente.py`) e cita o caminho nos prompts. |
| `installed_plugins.json` / `~/.claude/settings.json.enabledPlugins` | `configuracao.js:29, 46-48` | Formato de registro de plugins do Claude Code (lido diretamente do disco, sem API). |
| Marketplace da Ferreira Costa | `configuracao.js:117, 132-137, 173-206, 320-332` | `claude plugin marketplace add/update/list`, `claude plugin install/update` — todos comandos do CLI do Claude Code. |
| Ferramentas MCP do Atlassian | `qa.js:511-512` (`mcp__claude_ai_Atlassian__*`), `qa.js:501-503` | Nomenclatura de ferramenta MCP exposta pelo Claude Code (prefixo `mcp__<server>__<tool>`); outro agente com MCP pode ter outra convenção de nomes. |

**Nota de generalização geral do bloco 3**: o sistema de plugins/skills/marketplace é uma funcionalidade do ecossistema Claude Code sem equivalente padronizado em outros agentes. Generalizar provavelmente significa separar "o método" (regras de negócio: SDD, QA, mapeamento) do "transporte" (como isso é entregue ao modelo — hoje via plugin/skill do Claude Code, amanhã talvez via prompt/system message direto).

---

## 4. Integração da extensão com a extensão oficial "Claude Code" do VS Code **[PROFUNDA]**

Além de rodar o CLI, a extensão **se acopla à extensão oficial do VS Code** (não só ao CLI):

| Arquivo:linha | Trecho | Nota |
|---|---|---|
| `extensao/extension.js:5-9` | `vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['claudeVSCodeSidebarSecondary'], destinationId: 'workbench.view.extension.craftingTable' })` | Move a visão (webview) da extensão oficial Claude Code para dentro do contêiner da Crafting Table. Amarrado ao id de view `claudeVSCodeSidebarSecondary`, que só existe se a extensão oficial do Claude Code estiver instalada. |
| `extensao/infra/claude.js:11` | `await vscode.commands.executeCommand('claude-vscode.focus')` | Comando contribuído pela extensão oficial do VS Code do Claude Code. |
| `extensao/infra/claude.js:42, 44` | `vscode.commands.executeCommand('claude-vscode.editor.open', sid, texto)` | Idem — abre uma conversa específica no editor. |
| `extensao/infra/claude.js:50` | `t.input instanceof vscode.TabInputWebview && /claudeVSCodePanel/.test(t.input.viewType)` | Detecta abas abertas da extensão Claude Code pelo `viewType`. |
| `extensao/painel/moldura.js:82` | botão "Abrir a conversa do Claude" chamando a ação `claude` | UI que depende do botão/comando acima existir. |
| `extensao/componentes/icones.js:6` | ícone SVG customizado rotulado `claude:` (estrela), usado nos botões "Mencionar no Claude" (`@`) | Cosmético, mas o nome da chave e o conceito ("mencionar no Claude") são atrelados. |

**Nota de generalização**: isso é uma segunda camada de acoplamento, independente da CLI: a extensão depende da **extensão oficial do VS Code do Claude Code estar instalada** para abrir/colar/focar conversas interativas (fora do modo "segundo plano"). Um agente alternativo sem extensão de VS Code equivalente perderia esse fluxo de "conversa interativa vinculada ao ticket" inteiramente, exigindo uma reimplementação (painel de chat próprio, ou integração com a extensão de VS Code do outro agente, se existir).

---

## 5. Campo/setting: tela "Configurações → Geral" **[Tela/UI + Campo/setting]**

Arquivo: `extensao/configuracao/configuracao.js`. Arquivo: `extensao/package.json` (declaração das settings).

| Local | Texto/Campo exato | Categoria |
|---|---|---|
| `configuracao.js:89` | `cardTeste('agente', 'Agente de IA', e.agente, linha('Agente', 'Claude Code <span class="cfg-dim">(outros agentes em breve)</span>')` | Tela/UI — texto **hardcoded**, já citando "outros agentes em breve" |
| `configuracao.js:90` | `linha('Modelo', esc(val.modelo \|\| 'padrão do Claude Code'), 'modelo') + linha('Esforço', esc(val.esforco \|\| 'padrão do Claude Code'), 'esforco')` | Tela/UI |
| `configuracao.js:91` | `dica('Valem para as etapas do refinamento em segundo plano. A conversa aberta pelo botão do Claude segue o ~/.claude/settings.json.')` | Tela/UI |
| `configuracao.js:378-379` | `vscode.window.showQuickPick([PADRAO, 'opus', 'sonnet', 'fable', 'haiku', OUTRO], { title: 'Modelo do refinamento', ... })` com `PADRAO = 'padrão do Claude Code'` e sugestão `claude-opus-5-5` | Tela/UI — lista de modelos é literalmente a nomenclatura de modelos do Claude |
| `configuracao.js:383-385` | `vscode.window.showQuickPick([PADRAO, 'low', 'medium', 'high', 'xhigh', 'max'], { title: 'Esforço do refinamento', ... })` | Tela/UI/Campo — "esforço" (`effort`) é um parâmetro específico do Claude Code CLI |
| `configuracao.js:236` | `return { ok: false, curto: 'Claude não encontrado', texto: 'Instale o Claude Code e faça login (claude no terminal).' };` | Tela/UI (texto de diagnóstico) |
| `configuracao.js:239` | ``texto: `${v.out} · plugin sdd ${sddState() ? '✅' : '❌ (claude plugin install sdd@crafting-local)'} ...` `` | Tela/UI |
| `extensao/package.json:143-150` | ```"craftingTable.agente": { "type": "string", "enum": ["claude"], "default": "claude", "description": "Agente de IA do modo refinamento (por enquanto só Claude Code)." }``` | **Campo/setting** — já existe uma setting `craftingTable.agente`, mas o `enum` só aceita `"claude"`. Este é provavelmente o ponto de entrada natural para o trabalho futuro: ampliar o `enum`, mas hoje ela não é lida em lugar nenhum do código (`grep` não encontrou `.get('agente')` em uso) — é decorativa. |
| `extensao/package.json:151-154` | `"craftingTable.modelo"`: `"description": "Modelo do Claude no modo refinamento (alias como opus, sonnet, fable ou o nome completo). Vazio: o do ~/.claude/settings.json."` | Campo/setting |
| `extensao/package.json:156-167` | `"craftingTable.esforco"`: enum `["", "low", "medium", "high", "xhigh", "max"]`, `"description": "Esforço (effort) do Claude no modo refinamento..."` | Campo/setting |
| `extensao/package.json:204-207` | `"craftingTable.repositorios"`: `"description": "Repositórios de código que o Claude pode ler no refinamento: ..."` | Campo/setting (texto cosmético dentro da description) |

**Nota de generalização**: `craftingTable.agente` já existe como gancho (hoje travado em `"claude"` pelo `enum` e sem uso real no código) — é o lugar óbvio para pendurar a escolha de agente. `modelo`/`esforco` são conceitos específicos da API do Claude (nomes de modelo tipo `opus/sonnet/fable/haiku`, e o parâmetro `effort`); outro agente teria outro vocabulário de configuração (ou nenhum). Seria preciso: (a) tornar `agente` funcional (hoje é decorativo), (b) tornar `modelo`/`esforco` condicionais ao agente escolhido, ou abstraí-los num formato neutro traduzido por adaptador.

---

## 6. Textos de UI "o Claude fez/faz/disse X" (cosméticos, menção ampla) **[SUPERFICIAL]**

Dezenas de ocorrências em toda a extensão usam literalmente a palavra "Claude" em textos visíveis ao usuário (tooltips, estados vazios, mensagens de aviso/erro, placeholders). Praticamente todas são trocáveis por um termo genérico ("o agente", "a IA") sem mudar lógica. Lista representativa (arquivo:linha — texto):

- `extensao/componentes/aba-decisoes.js:15` — "...quando você responde uma pergunta do Claude ou pede para ele fazer diferente."
- `extensao/componentes/aba-docs.js:30-31` — botão "Mencionar no Claude"; "Nenhuma conversa do Claude aberta ainda."; "O que o Claude criar aparece aqui."
- `extensao/componentes/card-ticket.js:25` — "conversa atual do Claude"
- `extensao/componentes/transcricao.js:79` — "Pedido enviado ao Claude"
- `extensao/componentes/card-comando.js:36`, `extensao/modulos/emulador.js:133`, `extensao/painel/notas.js:140`, `extensao/modulos/evidencias.js:187`, `extensao/modulos/cofre.js:70` — botões "Mencionar no Claude" (`@`)
- `extensao/incidentes/evidencias.js:68` — "Resumo analítico do Claude"
- `extensao/incidentes/mergulho.js:40-41, 312` — "Pausar o Mergulho: o Claude para..."; "O que o Claude deve mudar?"
- `extensao/integracoes/teams.js:73` — "O Claude tem {n} perguntas esperando você" (card de notificação no Teams)
- `extensao/modulos/cofre.js:65, 74, 119` — "o Claude usa o segredo como $NOME..."; "Bloqueado para o Claude..."
- `extensao/modulos/conversas.js:113` — "Nenhuma conversa do Claude neste projeto."
- `extensao/refinamento/spec.js:33-45, 92, 111, 127, 143, 150, 201, 206, 208, 222-223, 228-229` — praticamente toda a tela da aba "Spec" fala em "o Claude cria a spec", "O Claude não está rodando agora", "Perguntas do Claude", "Pergunta do Claude respondida", etc.
- `extensao/refinamento/tarefas.js:17, 52-53, 287, 295` — "o Claude cria as tarefas", "Enviar para o Claude", "card fica 'Claude alterando'"
- `extensao/refinamento/duvidas.js:112`, `extensao/refinamento/analise.js:13, 15` — "pergunta do Claude", "Mencione no Claude"
- `extensao/qa/qa.js:544-550`, `extensao/qa/acoes.js:78-79, 109` — "O Claude cria a subtarefa...", "Análise do Claude", "O Claude aplica na subtarefa..."
- `extensao/painel/painel.js:191, 222` — "As conversas do Claude continuam, sem ticket."; comentário "dá tempo de o Claude gravar a 1ª mensagem"
- `extensao/painel/maestro.js:161, 164` — mensagens de erro de processo: "O Claude parou com erro (código X)"; "Não consegui rodar o Claude: {msg}"
- Testes (`teste-teams.js:48`, `teste-ticket.js:51`, `teste-transcricao.js:25,36`) fixam esses textos como asserts — trocar o texto exige atualizar os testes.

**Nota de generalização**: puramente de rótulo/i18n — trocar "Claude" por um termo neutro (ou por `agente.nome` dinâmico) em ~60-80 pontos de UI, sem mudar lógica. Risco principal: testes que fazem assert em string literal (acima) quebram se o texto mudar sem atualização conjunta.

---

## 7. Caminhos e convenções de armazenamento (`~/.claude/...`) **[PROFUNDA — estrutura de dados, não só nome]**

A extensão usa `~/.claude/` como "banco de dados" de fato (tickets, documentos, specs, skills, plugins, hooks, projects/histórico de sessão). Isso é mais profundo que um simples texto: é a convenção de pastas do produto Claude Code.

| Caminho | Usado em | O que é |
|---|---|---|
| `~/.claude/tickets/<CHAVE>/` | `extensao/infra/tickets.js:6-8`, `locais.js:8`, `implementacoes.js:3`, `incidentes.js:3` | Pasta "dona" de cada ticket (não escrita pelo Claude via `Write`/`Edit` — bloqueada pelo hook `guarda.js`) |
| `~/.claude/documentos/<sid>/` e `~/.claude/documentos/.atual/<hash>` | `hooks/documentos.py:4-5,16-18`, `extensao/modulos/conversas.js:14` | Pasta de documentos por conversa; granularidade e convenção de hash (`sha1(cwd)[:16]`) do hook `documentos.py` |
| `~/.claude/projects/<cwd convertido>/<sid>.jsonl` | `extensao/componentes/ao-vivo.js:36`, `conversas.js:14` | Onde o Claude Code grava o histórico (transcript) de cada sessão — formato e local são do produto Claude Code |
| `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json` | `configuracao.js:29,46,48,225` | Registro de plugins instalados e settings globais do Claude Code, lidos diretamente do disco (sem API) |
| `~/.claude/skills/testes-funcionais/` | `configuracao.js:42`, `qa.js:200,327-345` | Skill de terceiro, fora do controle da extensão |
| `~/.claude/hooks/*.py` | `instalar.sh:40-41`, README | Os 4 hooks Python linkados aqui |
| `~/.claude/refinamentos/<id>/meta.json` (legado) | `orquestrador.js:24`, `plugin/plugins/sdd/bin/sdd-state:5-6` | Caminho alternativo ainda suportado pelo `sdd-state` |

**Nota de generalização**: mesmo que o spawn do CLI seja abstraído, o **formato e a localização dos dados** (pasta `~/.claude`, histórico `.jsonl`, `installed_plugins.json`) continuariam amarrados ao Claude Code enquanto esses arquivos forem lidos diretamente. Um agente diferente guardaria sessão/histórico em outro lugar e formato — a camada de "onde está a conversa/documento" (`infra/sessao.js`, `modulos/conversas.js`, `locais.js`) precisaria de um adaptador por agente também.

---

## 8. `sdd-state` (CLI próprio da extensão, mas acoplado ao Claude Code) **[PROFUNDA, mas de acoplamento indireto]**

`plugin/plugins/sdd/bin/sdd-state` é um binário Node **da própria Crafting Table** (não é do Claude Code), que guarda o estado da spec em `sdd-state.json`. Ele não depende tecnicamente do Claude Code para rodar — mas:
- É empacotado como **plugin do Claude Code** (`.claude-plugin/plugin.json`) e só é descoberto/instalado via `claude plugin install` (bloco 3).
- O hook `guarda.js` (bloco 2) o protege usando o protocolo `PreToolUse` do Claude Code.
- A skill `sdd` (`plugin/plugins/sdd/skills/sdd/SKILL.md`) instrui **o modelo** a chamá-lo via `Bash(sdd-state:*)`, isto é, depende de o agente seguir instruções de skill/ferramenta Bash do jeito que o Claude Code entende.

**Nota de generalização**: o estado em si (`sdd-state.json`) e o CLI `sdd-state` são portáveis; o que não é portável é "como o agente é instruído a chamá-lo" (hoje: skill + Bash tool do Claude Code) e "como uma ação dele é bloqueada" (hoje: hook `PreToolUse`). Um agente diferente precisaria de outro mecanismo de "o agente só altera o estado através deste comando" — por exemplo, expor `sdd-state` como uma tool/function-call nativa desse outro agente, ou confiar apenas em instrução de prompt (mais frágil).

---

## 9. Instalação (`instalar.sh`) **[PROFUNDA]**

| Linha | Trecho | Nota |
|---|---|---|
| `instalar.sh:6-8` | `for c in node npm python3 claude code; do command -v "$c" ... done` | O comando `claude` é um **requisito obrigatório de instalação** (sem ele o script falha). |
| `instalar.sh:36-37` | `claude plugin marketplace add "$REPO/plugin" ...; claude plugin install sdd@crafting-local ...` | Instala o plugin SDD via CLI do Claude Code. |
| `instalar.sh:39-73` | Bloco Python que escreve hooks em `~/.claude/settings.json` (formato do bloco 2) | Acoplamento direto ao schema de settings do Claude Code. |

**Nota de generalização**: o instalador precisaria virar condicional por agente (instalar plugin/hooks só se o agente escolhido for Claude Code; para outro agente, outro passo de setup).

---

## 10. GNOME extension e nome do projeto **[SUPERFICIAL]**

| Item | Nota |
|---|---|
| `gnome/claude-abas-janelas@local/metadata.json` (uuid, nome, descrição citam "Claude Abas") | Nome/uuid da extensão GNOME. Funcionalmente ela só expõe um método D-Bus para focar uma janela por pid/título — não tem lógica específica do Claude Code, só o nome. Troca trivial. |
| `extensao/componentes/icones.js:6` (chave `claude:` do ícone SVG) | Nome de chave interna; trivial de renomear. |
| Nome do repositório/projeto `Crafting-Table`, textos de README | Já é neutro; o que cita Claude é o conteúdo (ver blocos acima). |

---

## 11. Documentação (README.md, extensao/README.md) **[Tela/UI equivalente — documentação]**

Ambos os READMEs documentam extensivamente o fluxo acima (requisitos `claude`/`code` no PATH, instalação do plugin, hooks em `~/.claude/hooks` e `~/.claude/settings.json`, troubleshooting "`Plugin sdd não encontrado` → `claude plugin install sdd@crafting-local`"). Não é código, mas precisará ser reescrito/parametrizado por agente quando a generalização acontecer. Destaques:

- `README.md:37` — "**⚙ Configurações → Agente de IA**: modelo e esforço do Claude nas etapas em segundo plano (vazio: o do `~/.claude/settings.json`)."
- `README.md:71-106` — passo a passo manual de instalação do plugin e dos hooks.
- `README.md:144-147` — tabela de troubleshooting citando comandos `claude plugin ...`.
- `extensao/README.md:102, 122, 124, 141` — explica o hook `crafting-testes.py`, a tabela de "Hooks do Claude Code", e o fluxo de Decisão ("o Claude regride a spec").

---

## Resumo executivo

A Crafting Table está acoplada ao Claude Code em **cinco camadas independentes**, cada uma exigindo uma generalização própria:

1. **Execução do agente (CLI/subprocess)** — `maestro.js` e os ~6 módulos que montam `spawn(claude, [...])` com flags proprietárias (`--plugin-dir`, `--settings enabledPlugins`, `--allowedTools`, `stream-json`). É o maior bloco de trabalho: precisa de uma interface neutra "executor de agente" com um adaptador Claude Code e espaço para outros adaptadores.
2. **Protocolo de hooks** — `hooks/*.py` e `plugin/plugins/sdd/hooks/guarda.js` dependem de eventos, payloads e, principalmente, do truque "sair com código 2 no hook `Stop` para acordar a conversa" — mecanismo exclusivo do Claude Code sem equivalente óbvio em outro agente; é o ponto mais difícil de generalizar porque sustenta todo o fluxo de aprovação humana assíncrona.
3. **Plugins/skills/marketplace** — o método SDD (`sdd@crafting-local`), o mapeamento de código (`mapa`), as regras de estilo (`foco`) e o QA (`fcx-qa-test-planning`, `testes-funcionais`) são entregues ao modelo como plugins/skills do Claude Code; outro agente não tem esse conceito pronto, então o "método" (prompts/regras) teria que ser desacoplado do "transporte" (plugin do Claude Code).
4. **Integração com a extensão oficial do VS Code do Claude Code** — `extension.js`/`infra/claude.js` movem e controlam a webview (`claudeVSCodeSidebarSecondary`, comandos `claude-vscode.*`) para o fluxo de conversa interativa; sem uma extensão equivalente de outro agente, esse pedaço simplesmente não existe para ele.
5. **Armazenamento em `~/.claude/...`** — tickets, documentos, histórico de sessão (`.jsonl`) e registro de plugins são lidos diretamente do disco no formato do Claude Code; outro agente guardaria isso em outro lugar/formato, então mesmo a camada de dados (`locais.js`, `sessao.js`, `conversas.js`) precisa de um adaptador.

Além disso, há duas camadas mais fáceis de resolver:

6. **Settings/UI de configuração** — a settings `craftingTable.agente` já existe mas está travada (`enum: ["claude"]`, sem uso real no código); `craftingTable.modelo`/`craftingTable.esforco` usam vocabulário específico do Claude (`opus/sonnet/haiku/fable`, `effort`). É o gancho natural para começar: destravar o enum e tornar modelo/esforço condicionais ao agente.
7. **Textos de UI cosméticos** — dezenas de strings "o Claude faz/diz X" espalhadas pela interface (abas Spec, Tarefas, Docs, Decisões, QA, Mergulho, Cofre, Teams) são só rótulo, trocáveis por um termo genérico ou por `agente.nome`; cuidado com testes que fixam esses textos como assert exato.

Recomendação de ordem de trabalho: primeiro desenhar a interface neutra do bloco 1 (executor) e do bloco 2 (como retomar um fluxo pausado sem o hook `Stop`+exit 2), porque praticamente tudo mais (blocos 3, 5, 6, 7) é consequência dessas duas decisões de arquitetura.
