# Crafting Table

Bancada de trabalho para o **Claude Code no VS Code**. Fica ao lado do chat oficial do Claude, sem modificá-lo, e acrescenta as ferramentas do dia a dia de quem desenvolve com ele: tickets do Jira, notas, documentos e evidências por conversa, botões de comando, emuladores Android, um cofre de senhas e refinamentos com **Spec Driven Development** guiado.

Barra lateral: **✳ Claude** · **🎫 Tickets** · **YouTube Music**.

## O que ela faz

O **ticket do Jira é o centro**: abra um ticket e tudo dele fica junto, numa pasta por ticket.

| No ticket | Em uma linha |
|---|---|
| **Docs** | Documentos que o Claude criou, anexos do Jira para baixar e as notas do ticket. |
| **Spec** | Os 7 passos do Spec Driven Development (plugin `sdd`), com aprovação só humana. |
| **Ticket** | Descrição, subtarefas, comentários e horas do Jira. |
| **Análise** | Handoffs de backend e mobile. |
| **TODO** | Quadro A fazer / Fazendo / Feito. |
| **Decisões** | Perguntas respondidas e decisões tomadas no chat. |
| **Dúvidas** | Perguntas do Claude que você marcou como "Tirar dúvida"; um clique comenta no Jira. |
| **Comandos · Evidências · Cofre · Conversas** | Botões de API/Metro e emuladores, prints e vídeos, senhas que o Claude usa sem ver, conversas do ticket. |
| **🔔 Rodapé** | Notificações do ticket: Claude terminou, pediu permissão, passo pronto para revisão. |

Todo item tem um botão **@** que cola a referência na conversa do Claude.

### Modo refinamento (plugin `sdd`)

**▶** no ticket abre uma conversa nova e o Claude cria a spec sozinho; **Dar início** e ele percorre os passos, continuando sozinho a cada aprovação; **⏸** pausa.

`0 Constituição → 1 Especificação → 2 Clarificação (Portão 1) → 3 Plano técnico → 4 Tarefas → 5 Análise (Portão 2) → 6 Implementação`

- Os arquivos ficam num repositório git de specs (`craftingTable.specsDir`): `constitution.md` e uma pasta `<CHAVE>-<slug>/` por ticket.
- **Só você aprova**, na aba Spec, depois de abrir o arquivo; um hook impede o Claude de aprovar ou editar o estado.
- Editou um arquivo já aprovado? O passo volta para revisão, os dependentes ficam desatualizados e **Ver mudanças** mostra o diff.

Detalhes de cada aba: [`extensao/README.md`](extensao/README.md).

## Requisitos

| O quê | Para quê |
|---|---|
| **Linux** com VS Code ≥ 1.80 | A extensão (usa `/proc` e o chaveiro do sistema). |
| Extensão oficial **Claude Code** no VS Code | O chat. |
| **Claude Code CLI** (`claude` no PATH) | Plugin SDD e hooks. |
| **Node.js** ≥ 18 e npm | Dependências da extensão e o `sdd-state`. |
| **Python 3** | Hooks de Documentos, Decisões e testes. |
| Android SDK (`$ANDROID_HOME` ou `~/Android/Sdk`) | *Opcional:* Emuladores e Evidências. |
| GNOME | *Opcional:* trazer a janela do emulador para frente no Wayland. |
| Conta no Jira Cloud + API token | *Opcional:* aba Ticket. |

## Instalação

### Pelo script (recomendado)

```bash
git clone https://github.com/MaxsuelsSouza/Crafting-Table.git ~/Crafting-Table
cd ~/Crafting-Table
./instalar.sh
```

Depois **feche todas as janelas do VS Code e abra de novo**. Na primeira vez o *Reload Window* não basta.

O script faz, e pode ser rodado de novo sem estragar nada:

1. `npm ci` em `extensao/`.
2. Liga `~/.vscode/extensions/claude-abas` → `extensao/` (link simbólico: um `git pull` já atualiza a extensão). Se já existir uma pasta lá, ela é guardada como `claude-abas.bak-<data>`.
3. Instala o plugin SDD: `claude plugin marketplace add ./plugin` e `claude plugin install sdd@crafting-local`.
4. Liga os hooks em `~/.claude/hooks/` e os registra em `~/.claude/settings.json` (com backup `settings.json.bak-crafting-*`).
5. Se houver GNOME, liga a extensão `claude-abas-janelas@local`.

### Manual

1. **Extensão**
   ```bash
   cd ~/Crafting-Table/extensao && npm ci --omit=dev
   ln -s ~/Crafting-Table/extensao ~/.vscode/extensions/claude-abas
   ```
   O nome da pasta precisa ser `claude-abas`: o Cofre e o hook de documentos usam esse caminho.
2. **Plugin SDD**
   ```bash
   claude plugin marketplace add ~/Crafting-Table/plugin
   claude plugin install sdd@crafting-local
   ```
3. **Hooks**: ligue `hooks/*.py` em `~/.claude/hooks/` e acrescente ao `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "SessionStart": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/documentos.py 2>/dev/null || true", "timeout": 10 }] }],
       "UserPromptSubmit": [
         { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/documentos.py 2>/dev/null || true", "timeout": 10 }] },
         { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/decisoes.py 2>/dev/null || true", "timeout": 120, "async": true }] }
       ],
       "PostToolUse": [
         { "matcher": "Write", "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/documentos.py 2>/dev/null || true", "timeout": 10 }] },
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/crafting-testes.py 2>/dev/null || true", "timeout": 30 }] },
         { "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/decisoes.py 2>/dev/null || true", "timeout": 15 }] }
       ],
       "PreToolUse": [
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/crafting-testes.py 2>/dev/null || true", "timeout": 1000 }] }
       ],
       "Stop": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/notificacoes.py 2>/dev/null || true", "timeout": 10 }] }],
       "Notification": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/notificacoes.py 2>/dev/null || true", "timeout": 10 }] }]
     }
   }
   ```
4. **GNOME** (opcional): `ln -s ~/Crafting-Table/gnome/claude-abas-janelas@local ~/.local/share/gnome-shell/extensions/`, saia e entre na sessão e rode `gnome-extensions enable claude-abas-janelas@local`.
5. Feche o VS Code inteiro e abra de novo.

## Primeiros passos

1. Clique no ícone da **mesa** na barra lateral do VS Code. O chat do Claude aparece ali dentro.
2. **Tickets → ＋ Novo ticket**: cole o link do Jira. Na primeira vez pede e-mail e API token ([criar token](https://id.atlassian.com/manage-profile/security/api-tokens)), guardados no cofre de senhas do VS Code.
3. No ticket aberto, **▶** inicia o modo refinamento: o Claude cria a spec em `craftingTable.specsDir` (padrão `~/specs`) e espera **Dar início**.
4. **Cofre**: crie `NOME_DA_CHAVE`, marque **env ✓**, e o Claude passa a usar `$NOME_DA_CHAVE` sem ver o valor.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| A mesa não aparece na barra lateral | Feche o VS Code inteiro (`Ctrl+Q`) e abra de novo; confira o link com `ls -l ~/.vscode/extensions/claude-abas`. |
| Docs vazio em "Sem ticket" numa conversa antiga | Os hooks só identificam a conversa depois da próxima mensagem nela. |
| `Plugin sdd não encontrado` | `claude plugin install sdd@crafting-local`. |
| Aprovar da aba Spec apagado | O VS Code recarregou e o Claude não está esperando: clique em **▶** no topo do ticket; com a conversa aberta, o Aprovar volta em segundos. |
| ▶ não fez o Claude começar | Em 25 s aparece **Abrir com o comando**: ele abre a conversa com o comando escrito, é só enviar. |
| Mudou o plugin e nada aconteceu | Suba `version` em `plugin/plugins/sdd/.claude-plugin/plugin.json`, rode `claude plugin marketplace update crafting-local && claude plugin update sdd@crafting-local` e abra uma conversa nova. |

## Estrutura do repositório

```
extensao/   extensão do VS Code (id local.claude-abas)
plugin/     marketplace local "crafting-local" com o plugin sdd (skill, comandos, sdd-state, hooks)
hooks/      hooks do Claude Code: documentos.py, decisoes.py, notificacoes.py, crafting-testes.py
gnome/      extensão do GNOME para trazer janelas para frente
instalar.sh instalação em um comando
```

## Desenvolvimento

- Mudou `.js` da extensão: `Ctrl+Shift+P` → **Developer: Reload Window**.
- Mudou `extensao/package.json` (abas, ícones): feche o VS Code inteiro e abra de novo.
- Teste rápido: `node extensao/teste-ticket.js`.
