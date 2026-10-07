# Crafting Table

Bancada de trabalho ao lado do Claude Code. O ícone da mesa na barra lateral abre o chat do Claude (o chat oficial é movido para dentro do contêiner da Crafting Table na primeira execução), e os botões no cabeçalho trocam para as outras ferramentas. O botão da tela aberta fica laranja.

```
✳  🌐  📄  📖  ▶  📷  🔒  ☰  📱  👥
Claude · Ticket · Documentos · Notas · Comandos · Evidências · Cofre · Conversas · Emuladores · Teams
```

A extensão oficial do Claude Code não é modificada. As abas vivem ao lado dela.

## Mencionar no Claude (@)

O `@` do chat do Claude só lista arquivos do projeto aberto, e outra extensão não consegue acrescentar itens a ele. Por isso cada item das abas tem um botão **@**, que cola a referência na conversa atual (sem enviar) para você completar a frase:

| Aba | O que o @ cola |
|---|---|
| Documentos, Evidências | `@/caminho/do/arquivo`, que o Claude Code lê |
| Notas | `@/caminho/da/nota` e o trecho selecionado, se houver |
| Ticket | `WMS-123 (link do Jira)` |
| Comandos | nome, comando, pasta, situação e PIDs |
| Emuladores | AVD, serial, PID e os caminhos do `emulator` e do `adb` |
| Cofre | `$NOME` e como usar pelo `cofre` (nunca o valor) |

## Abas

### ✳ Claude
O chat oficial do Claude Code, sem alterações.

### 📖 Notas
Bloco de notas **por conversa** do Claude, com salvamento automático em `~/.claude/documentos/<id-da-conversa>/.notas.html`. Conversa nova = nota em branco.
- **T** título, **1.** lista numerada, **•** lista com marcador (`Ctrl+Alt+1`, `Ctrl+Shift+7`, `Ctrl+Shift+8`)
- **🔍** busca na nota (`Ctrl+F`; Enter = próxima, Shift+Enter = anterior)
- **✳ Claude** cola o texto selecionado (ou a nota inteira) na conversa atual do Claude, sem enviar

### 🌐 Ticket
Lista de tickets do Jira.
- **+ Adicionar ticket**: cole o link (`.../browse/WMS-123` ou `?selectedIssue=WMS-123`)
- Clique abre o ticket: status, tipo, prioridade, responsável, descrição e subtarefas
- **✳ Adicionar ao Claude** cola `Leia esse ticket <link>` na conversa atual do Claude
- **🔍** filtra a lista por chave ou título
- Na primeira vez, pede o e-mail e o API token do Jira. Os dois ficam no cofre de senhas do VS Code.

### 🧭 Refinamentos
Um refinamento por atividade, **técnico** ou **funcional**, cada um com a sua conversa do Claude.
- **＋ Refinamento**: título, tipo e link do ticket (opcional). Abre uma **conversa nova** no Claude já com o pedido escrito; ao enviar a primeira mensagem, ela é vinculada ao refinamento e recebe o mesmo título.
- Lista com **@** (mencionar), **✎** (editar) e **✕** (excluir: notas, TODO e handoffs vão para a lixeira; a conversa fica).
- Dentro: **✳ Abrir conversa** e o menu **Docs · Ticket · Backend · Mobile · Notas · TODO**:
  - Docs: documentos da conversa vinculada
  - Ticket: link, abrir no Jira, mencionar, trocar
  - Backend / Mobile: `handoff-backend.md` e `handoff-mobile.md` (o que foi analisado em cada repositório), com prévia, edição e @
  - Notas: post-it do refinamento
  - TODO: o quadro do Atelier (A fazer / Fazendo / Feito), em lista ou quadro, com arrastar
  - Decisões: histórico (mais recente primeiro) com data e título; clique abre o resumo. Gravado pelo hook `~/.claude/hooks/decisoes.py`: perguntas do Claude respondidas (exato) e mensagens suas que o Haiku classifica como decisão (em segundo plano)
- Tudo fica em `~/.claude/refinamentos/<id>/`.
- **Tipo Spec** (plugin `sdd`, instalado como `sdd@crafting-local` a partir de `~/.claude/plugins-locais/crafting`): ao criar, escolhe o repositório. **▶ Iniciar/Continuar spec** cola `/sdd:iniciar` ou `/sdd:continuar` na conversa do refinamento. A aba **Constituição** mostra os 7 passos (0 Constituição → 6 Implementação): cinza = pendente, azul pulsando = Claude trabalhando, amarelo = aguardando revisão (**Aprovar** só depois de abrir o arquivo; portões 1 e 2 travam com pergunta aberta ou achado bloqueante), verde = aprovado, laranja = desatualizado (**Reconciliar**). Os arquivos ficam em `<repo>/constitution.md` e `<repo>/specs/NNN-<feature>/` (spec.md, plan.md, tasks.md, analise.md, sdd-state.json). Aprovar é só humano: o hook do plugin bloqueia o Claude de aprovar ou editar o estado.

### 📄 Documentos
Documentos que o Claude criou **na conversa ativa**. Uma conversa nova começa com a aba vazia.
- Pasta por conversa: `~/.claude/documentos/<id-da-conversa>/`
- O Claude é avisado no início de cada conversa de que deve salvar documentos nessa pasta
- Todo `.md/.html/.pdf/.docx/.xlsx/.pptx/.csv/.txt` que ele criar em outro lugar ganha um atalho na pasta
- Clique abre o documento; **✕** tira o atalho (o original continua) ou manda o arquivo para a lixeira

Funciona com hooks do Claude Code (veja *Instalação*). Trocar para uma conversa antiga só atualiza a aba depois da próxima mensagem nela.

### ▶ Comandos
Botões configuráveis para subir backend, Metro, `yarn start` etc.
- **+ Novo botão**: nome, comando e pasta
- **▶** roda num terminal com o nome do botão; **■** para
- **⋯** lista os processos que o botão iniciou, com PID, e permite matar um ou todos
- **✎** edita, **✕** remove

### 📷 Evidências
Prints e vídeos do emulador **por conversa** do Claude, em `~/.claude/documentos/<id-da-conversa>/evidencias/`. O ticket da branch atual só entra no nome dos arquivos.
- **📷 Print** salva a tela do emulador
- **⏺ Gravar / ⏹ Parar** grava a tela (o Android limita a 3 min)
- Galeria atualiza sozinha; clique abre, **✕** manda para a lixeira
- Os terminais recebem `WMS_DOC_HUB_EVIDENCE_DIR` apontando para a pasta, como no wms-hub

### 🔒 Cofre
Senhas que o Claude **usa sem receber o valor**.
- **+ Novo segredo**: nome no padrão `NOME_DA_CHAVE` (maiúsculas, números e `_`) e valor de até 256 caracteres
- Valores cifrados no cofre do VS Code (chaveiro do sistema); nunca em arquivo de texto
- **env ✓** libera o segredo para o Claude; **✎** troca o valor; **✕** remove
- O Claude roda `~/.vscode/extensions/claude-abas/bin/cofre '<comando com $NOME>'`: quem executa é a extensão, com os segredos como variáveis de ambiente, e a saída volta mascarada (valor puro, base64 e URL viram `••••`)
- No início de cada conversa o Claude recebe só os **nomes** liberados

**Limite:** o Claude roda com o seu usuário. Um comando que transforme o valor de outro jeito (inverter, cortar em pedaços) escapa da máscara. O Cofre evita vazamento por acidente (log, `echo`, mensagem de erro), não um Claude tentando extrair de propósito.

### ☰ Conversas
Conversas do Claude Code deste projeto, da mais recente para a mais antiga, com título, data e quantos documentos e evidências cada uma tem.
- Clique abre a conversa no Claude
- **🗑** exclui a conversa **e tudo dela**: histórico do chat, pasta da conversa (documentos, notas, evidências), backups de edição e variáveis da sessão. Vai para a lixeira do sistema.
- A conversa aberta agora (🟢) não pode ser excluída
- Documentos que eram atalhos para arquivos do repositório: some o atalho, o original fica

### 📱 Emuladores
Todos os AVDs da máquina.
- Clicar no **📱** do cabeçalho traz o emulador aberto para frente
- **▶** liga com janela, **■** desliga, **🧹** wipe data (apaga os dados e liga do zero)
- **⋯** lista os processos do emulador, com PID, e permite matar

## Integração com a skill `testes-funcionais`

Sem modificar a skill. O hook `~/.claude/hooks/crafting-testes.py` observa os comandos Bash do Claude:

1. **`preparar-ambiente.py`** (a skill preparando o ambiente): antes de rodar, o hook resolve os worktrees com a etapa `refs` da própria skill e pede à Crafting Table:
   - emulador: liga o `craftingTable.avdPadrao` (padrão `Small_Phone`) se nenhum aparelho estiver conectado;
   - botões **API WMS-XXXX** e **Metro WMS-XXXX** na aba Comandos, nos worktrees certos, com as mesmas variáveis da skill.

   O hook espera tudo responder (até 10 min). Depois, a skill reaproveita a API, o Metro e o aparelho.
2. **`executar.py --com-app` / `executar-jornada.py`**: grava a tela do emulador durante a jornada, emendando trechos de 3 min, nas evidências da conversa.
3. A aba **Evidências** mostra também as pastas da skill para o ticket: prints e vídeo do Maestro, e o consolidado (somente leitura).

Com o VS Code fechado, ou em qualquer erro, o hook não faz nada e a skill segue como sempre.

## Instalação

A extensão fica em `~/.vscode/extensions/claude-abas/` (id `local.claude-abas`).

Peças de fora do VS Code:

| Peça | Para quê | Onde |
|---|---|---|
| Hooks do Claude Code | abas Documentos, Notas e Evidências (conversa ativa) | `~/.claude/settings.json` + `~/.claude/hooks/documentos.py` |
| Hook da skill de testes | integração com `testes-funcionais` | `~/.claude/settings.json` (PreToolUse/PostToolUse Bash) + `~/.claude/hooks/crafting-testes.py` |
| Extensão do GNOME `claude-abas-janelas@local` | trazer o emulador para frente no Wayland | `~/.local/share/gnome-shell/extensions/` (vale depois de sair e entrar na sessão) |
| Android SDK | Evidências e Emuladores | `$ANDROID_HOME` ou `~/Android/Sdk` |

Bibliotecas: `@grpc/grpc-js` e `@grpc/proto-loader` (print do emulador).

## Desenvolvimento

- Mudou o `package.json` (abas, ícones, nomes)? Feche o VS Code inteiro (`Ctrl+Q`) e abra de novo. O *Reload Window* não relê o manifesto.
- Mudou só `.js`? `Ctrl+Shift+P` → **Developer: Reload Window**.

## Limitações conhecidas

- **✳ Adicionar ao Claude** cola pela área de transferência (a extensão do Claude não tem API para escrever na conversa atual). A área de transferência volta ao conteúdo anterior logo depois.
- A colagem depende de tempo (0,3 s para abrir e 0,3 s para focar a caixa); numa máquina lenta o texto pode não entrar.
- Vídeos abrem no player do sistema: o VS Code não reproduz mp4.
