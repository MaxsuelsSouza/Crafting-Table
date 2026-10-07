# Crafting Table

Bancada de trabalho para o **Claude Code no VS Code**. Fica ao lado do chat oficial do Claude, sem modificá-lo, e acrescenta as ferramentas do dia a dia de quem desenvolve com ele: tickets do Jira, notas, documentos e evidências por conversa, botões de comando, emuladores Android, um cofre de senhas e refinamentos com **Spec Driven Development** guiado.

```
✳  🧭  🌐  📄  📖  ▶  📷  🔒  ☰  📱  👥
Claude · Refinamentos · Ticket · Documentos · Notas · Comandos · Evidências · Cofre · Conversas · Emuladores · Teams
```

## O que ela faz

| Aba | Em uma linha |
|---|---|
| ✳ **Claude** | O chat oficial do Claude Code, movido para dentro da Crafting Table. |
| 🧭 **Refinamentos** | Um refinamento por atividade (técnico, funcional ou **Spec**), cada um com sua conversa, docs, ticket, handoffs backend/mobile, notas, TODO e histórico de decisões. |
| 🌐 **Ticket** | Lista de tickets do Jira com descrição, subtarefas, comentários e horas. |
| 📄 **Documentos** | Relatórios e análises que o Claude criou na conversa ativa. |
| 📖 **Notas** | Bloco de notas por conversa, com títulos, listas e busca. |
| ▶ **Comandos** | Botões para subir API, Metro etc., com lista e kill de processos. |
| 📷 **Evidências** | Prints e gravações do emulador por conversa. |
| 🔒 **Cofre** | Senhas que o Claude **usa sem ver o valor** (a saída volta mascarada). |
| ☰ **Conversas** | Conversas do projeto; excluir apaga a conversa e tudo dela. |
| 📱 **Emuladores** | Liga, desliga, wipe e traz para frente os AVDs da máquina. |

Todo item tem um botão **@** que cola a referência na conversa do Claude.

### Spec Driven Development (plugin `sdd`)

O tipo de refinamento **Spec** conduz a feature em 7 passos, com revisão humana entre eles:

`0 Constituição → 1 Especificação → 2 Clarificação (Portão 1) → 3 Plano técnico → 4 Tarefas → 5 Análise (Portão 2) → 6 Implementação`

- Os arquivos ficam no repositório escolhido: `constitution.md` e `specs/NNN-<feature>/` (`spec.md`, `plan.md`, `tasks.md`, `analise.md`, `sdd-state.json`).
- A aba **Constituição** mostra cada passo: cinza (pendente), azul (Claude trabalhando), amarelo (aguardando revisão), verde (aprovado), laranja (desatualizado).
- **Só você aprova**: o botão Aprovar libera depois de abrir o arquivo; um hook impede o Claude de aprovar ou editar o estado.
- Ao aprovar, o Claude **acorda sozinho** na conversa e segue para o próximo passo.
- Editou um arquivo já aprovado? O passo volta para revisão, os dependentes ficam desatualizados e **Ver mudanças** mostra o diff contra a versão aprovada.
- Dá para parar em qualquer passo e continuar outro dia: **▶ Continuar spec** retoma de onde parou.

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
       ]
     }
   }
   ```
4. **GNOME** (opcional): `ln -s ~/Crafting-Table/gnome/claude-abas-janelas@local ~/.local/share/gnome-shell/extensions/`, saia e entre na sessão e rode `gnome-extensions enable claude-abas-janelas@local`.
5. Feche o VS Code inteiro e abra de novo.

## Primeiros passos

1. Clique no ícone da **mesa** na barra lateral do VS Code. O chat do Claude aparece ali dentro.
2. **Ticket**: na primeira vez a aba pede e-mail e API token do Jira ([criar token](https://id.atlassian.com/manage-profile/security/api-tokens)). Ficam no cofre de senhas do VS Code.
3. **Refinamentos → ＋ Refinamento → tipo Spec**: escolha o repositório e clique em **▶ Iniciar spec**. Envie a mensagem que aparece no chat.
4. **Cofre**: crie `NOME_DA_CHAVE`, marque **env ✓**, e o Claude passa a usar `$NOME_DA_CHAVE` sem ver o valor.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| A mesa não aparece na barra lateral | Feche o VS Code inteiro (`Ctrl+Q`) e abra de novo; confira o link com `ls -l ~/.vscode/extensions/claude-abas`. |
| Aba Documentos/Notas vazia numa conversa antiga | Os hooks só identificam a conversa depois da próxima mensagem nela. |
| `Plugin sdd não encontrado` | `claude plugin install sdd@crafting-local`. |
| Aprovar da aba Constituição apagado com aviso "Continuar spec" | O VS Code recarregou e o Claude não está esperando: clique em **▶ Continuar spec**; com a conversa aberta, o Aprovar volta em segundos. |
| Mudou o plugin e nada aconteceu | Suba `version` em `plugin/plugins/sdd/.claude-plugin/plugin.json`, rode `claude plugin marketplace update crafting-local && claude plugin update sdd@crafting-local` e abra uma conversa nova. |

## Estrutura do repositório

```
extensao/   extensão do VS Code (id local.claude-abas)
plugin/     marketplace local "crafting-local" com o plugin sdd (skill, comandos, sdd-state, hooks)
hooks/      hooks do Claude Code: documentos.py, decisoes.py, crafting-testes.py
gnome/      extensão do GNOME para trazer janelas para frente
instalar.sh instalação em um comando
```

## Desenvolvimento

- Mudou `.js` da extensão: `Ctrl+Shift+P` → **Developer: Reload Window**.
- Mudou `extensao/package.json` (abas, ícones): feche o VS Code inteiro e abra de novo.
- Teste rápido: `node extensao/teste-ticket.js`.
