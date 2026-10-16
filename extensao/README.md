# Crafting Table

Bancada de trabalho ao lado do Claude Code, com o **ticket do Jira no centro**: documentos, notas, evidências, conversas, tarefas, decisões e dúvidas ficam presos ao ticket. A extensão oficial do Claude Code não é modificada.

Barra lateral: **✳ Claude** (o chat oficial, movido para o contêiner da Crafting Table na primeira execução) · **🎫 Tickets**.

## Tickets

- **＋ Novo ticket**: cole o link (`.../browse/WMS-123`). A lista mostra chave, título e a coluna do board.
- **Sem ticket**: documentos e notas da conversa atual do Claude que não pertence a nenhum ticket.
- **Excluir** move a pasta para `~/.claude/tickets/_arquivados/` (nada é apagado; as conversas continuam).
- Tudo do ticket mora em `~/.claude/tickets/<CHAVE>/` (`.ticket.json`, documentos, `.notas.html`, `.decisoes.json`, `.duvidas.json`, `.notificacoes.jsonl`, `evidencias/`).
- Conversa nova aberta pelo ticket é vinculada a ele na primeira mensagem e ganha o título `CHAVE · título`.

### Tela cheia e configurações

Na barra de título da view: **⤢ Tela cheia** (abre a mesma tela numa aba do editor e esconde as barras laterais; as duas telas ficam espelhadas, com o mesmo estado) e **⚙ Configurações** (Agente de IA com modelo e esforço, Jira, board, specs, repositórios, banco e Teams, cada um com **Testar**). Na aba em tela cheia, o botão ⤡ **Sair da tela cheia** fecha a aba e mostra a barra lateral de volta.

### Ticket aberto

**Cabeçalho fixo**: ← voltar · título · ▶/⏸ (modo refinamento) · ✦ conversa do Claude do ticket · 🎫 abrir no Jira · pills de status do board e do refinamento · ⟳ atualizar do Jira.

**Menu**: Docs · Spec · Ticket · Análise · Tarefas · Decisões · Dúvidas | Evidências · Conversas. **Comandos** (com os emuladores) e **Cofre** ficam em ⚙ Configurações; o rodapé do ticket tem a caixa ▶ Comandos para rodar/parar comandos e ligar/desligar emuladores.

| Aba | O que mostra |
|---|---|
| Docs | Documentos do ticket, anexos do Jira ainda não baixados (**↓ Baixar**) e as Notas (editor com fonte, tamanho, cores, alinhamento, busca e @) |
| Spec | Os 7 passos do plugin `sdd` (ver abaixo) |
| Ticket | Descrição, subtarefas, comentários e horas, direto do Jira |
| Análise | `mapa-backend.md` / `mapa-mobile.md` da **pasta da spec** (o mapeamento do passo 3, versionado com a spec), com prévia, edição e @ |
| Tarefas | Cards das tarefas do passo 4 (Pendentes / Aprovadas / Reprovadas). O card abre o detalhe com estimativa original, "Vincular a mim", **Aprovar** (cria a subtarefa no Jira, com confirmação), **Reprovar** e **Pedir alteração** (o Claude ajusta em segundo plano) |
| Decisões | Perguntas do Claude respondidas e mensagens suas classificadas como decisão (hook `decisoes.py`) |
| Dúvidas | O que você marcou como **Tirar dúvida**; **Enviar para os comentários do ticket** mostra a prévia e comenta no Jira, e o card vai para a caixa cinza "Enviadas". Dúvida sem resposta (enviada ou não) **trava o avanço para o próximo passo**; o cartão do topo avisa e leva à aba. Fecha por **Dar resposta** (no card) ou por comentário novo no Jira: o Claude sugere qual dúvida ele responde e você confirma |

**Rodapé**: 🔔 notificações do ticket com contador de não lidas (o Claude terminou, pediu permissão, passo da spec pronto, dúvida registrada). Abrir marca como lidas.

Na primeira vez que fala com o Jira, pede o e-mail e o API token; os dois ficam no cofre de senhas do VS Code.

### Modo refinamento e Spec (plugin `sdd`)

- **▶** abre uma conversa nova; o hook do plugin a vincula ao ticket e o Claude cria a spec no repositório de specs (`craftingTable.specsDir`, padrão `~/specs`, uma pasta `<CHAVE>-<slug>/` por ticket) sozinho. Spec pronta → **Dar início**: o Claude segue os passos e continua sozinho a cada aprovação. **⏸** pausa depois da etapa atual. Se o Claude não começar em 25 s, aparece **Abrir com o comando**.
- Passos: `0 Constituição → 1 Especificação → 2 Clarificação (Portão 1) → 3 Plano → 4 Tarefas → 5 Análise (Portão 2) → 6 Plano de testes QA (Portão 3)`, em `<specs>/constitution.md` e `<specs>/<CHAVE>-<slug>/`.
- Cores: cinza pendente, azul Claude trabalhando, amarelo aguardando revisão, verde aprovado, laranja desatualizado (**Reconciliar**).
- **Só você aprova**, pela aba Spec, depois de abrir o arquivo. Um hook do plugin impede o Claude de aprovar ou editar o estado.
- No modo refinamento toda pergunta do Claude tem a opção **Tirar dúvida**: ela vai para a aba Dúvidas em vez de virar decisão.

## Mencionar no Claude (@)

O `@` do chat do Claude só lista arquivos do projeto aberto. Cada item das abas tem um botão **@**, que abre a conversa do ticket no editor e cola a referência (sem enviar):

| Onde | O que o @ cola |
|---|---|
| Documentos, Evidências, Análise | `@/caminho/do/arquivo` |
| Notas | `@/caminho/da/nota` e o trecho selecionado |
| Comandos | nome, comando, pasta, situação e PIDs |
| Emuladores | AVD, serial, PID e os caminhos do `emulator` e do `adb` |
| Cofre | `$NOME` e como usar pelo `cofre` (nunca o valor) |

## Seções de fora do ticket

Abertas pelo menu, com o mesmo cabeçalho e rodapé do ticket.

### ▶ Comandos (⚙ Configurações → Comandos)
Botões configuráveis para subir backend, Metro, `yarn start` etc.
- **＋ Adicionar**: nome, comando e pasta
- **▶** roda num terminal com o nome do botão; **■** para
- **⋯** lista os processos que o botão iniciou, com PID, e permite matar um ou todos
- **✎** edita, **✕** remove

### 📷 Evidências
Prints e vídeos do emulador **por ticket**, em `<pasta do ticket>/evidencias/` (sem ticket: `~/.claude/documentos/<id-da-conversa>/evidencias/`). O ticket da branch atual só entra no nome dos arquivos.
- **📷 Print** salva a tela do emulador
- **⏺ Gravar / ⏹ Parar** grava a tela (o Android limita a 3 min)
- Galeria atualiza sozinha; clique abre, **✕** manda para a lixeira
- Os terminais recebem `WMS_DOC_HUB_EVIDENCE_DIR` apontando para a pasta, como no wms-hub

### 🔒 Cofre (⚙ Configurações → Cofre)
Senhas que o Claude **usa sem receber o valor**.
- **+ Novo segredo**: nome no padrão `NOME_DA_CHAVE` (maiúsculas, números e `_`) e valor de até 500 caracteres
- Valores cifrados no cofre do VS Code (chaveiro do sistema); nunca em arquivo de texto
- **env ✓** libera o segredo para o Claude; **✎** troca o valor; **✕** remove
- O Claude roda `~/.vscode/extensions/crafting-table/bin/cofre '<comando com $NOME>'`: quem executa é a extensão, com os segredos como variáveis de ambiente, e a saída volta mascarada (valor puro, base64 e URL viram `••••`)
- No início de cada conversa o Claude recebe só os **nomes** liberados

**Limite:** o Claude roda com o seu usuário. Um comando que transforme o valor de outro jeito (inverter, cortar em pedaços) escapa da máscara. O Cofre evita vazamento por acidente (log, `echo`, mensagem de erro), não um Claude tentando extrair de propósito.

### ☰ Conversas
Conversas do Claude Code deste projeto, da mais recente para a mais antiga, com título, data e quantos documentos e evidências cada uma tem.
- Clique abre a conversa no Claude
- **🗑** exclui a conversa **e tudo dela**: histórico do chat, pasta da conversa (documentos, notas, evidências), backups de edição e variáveis da sessão. Vai para a lixeira do sistema.
- A conversa aberta agora (🟢) não pode ser excluída
- Documentos que eram atalhos para arquivos do repositório: some o atalho, o original fica

### 📱 Emuladores (⚙ Configurações → Comandos)
Todos os AVDs da máquina.
- Clicar no **📱** do cabeçalho traz o emulador aberto para frente
- **▶** liga com janela, **■** desliga, **🧹** wipe data (apaga os dados e liga do zero)
- **⋯** lista os processos do emulador, com PID, e permite matar

## Esteira de QA

Mesmo desenho da esteira de Implementação, em `extensao/janelas/qa/`. Estado em dotfiles na pasta `qa/` do ticket.

1. **Planejamento**: o dossiê (`entrada.js`, reaproveita `infra/dossie/`) junta descrição, spec, tarefas, incidente, o que a Implementação entregou e o briefing do dev, cada fonte com a confiança (aprovado, gerado, bruto, verbal). Ticket só com título **pergunta** o que testar (`.briefing.md`) em vez de inventar. O Claude escreve `qa-plano.md` na área da IA; o plano **fica só local** (aba Docs, `planejamento-qa-vN.md`) até você abrir, ler e **Aprovar**: só então a extensão cria ou atualiza a subtarefa `[QA]`.
2. **Cenários**, **Ambiente** e **Massa** como antes. **Execução** (Etapa 6), por cenário: **6.1** o Claude só escreve o roteiro (`qa-state roteiro CTnn <json>`: flows Maestro, bipe, espera e consultas SELECT antes/depois; validado na hora com a massa), reaproveitado enquanto o cenário não muda; **6.2** a extensão roda o roteiro sem Claude (vídeo, prints, `consulta-*.txt`, `jornada.txt` viram anexo); **6.3** só se falhou, um Claude curto diz o lado da falha: código (falhou), massa (sem-massa) ou roteiro (`qa-state roteiro CTnn refazer`, uma volta ao 6.1; na 2ª pausa). Cenário sem tela nem banco (só API) o Claude ainda executa e conclui direto. **Massa na execução**: antes de cada cenário a extensão roda **Validar massa** (a consulta do item de novo, só SELECT): válida segue; inválida renova só a massa daquele cenário (Etapa 5 restrita: busca 5 min, depois UPDATE aprovado); o 2º cenário seguido com massa inválida refaz a Etapa 5 para todos os pendentes; sem como achar nem gerar, o cenário fica **não executável** (final: a retomada não mexe, não trava a publicação, só o ↻ Refazer devolve). Massa consumida conta como inválida. **Aba Roteiro** (componente `componentes/roteiros.js`, feito para servir também a Incidentes e Implementações): um item R01, R02… por cenário com roteiro ou massa; aberto mostra o roteiro que o Maestro executa (etapas, consultas e a descrição que o Claude escreve) já com a massa anexada: as variáveis aparecem com os valores da massa do cenário. **Retomada depois do ⏸**: no mesmo dia (antes do refresh do banco) o cenário pausado reinicia validando só a massa dele; depois do refresh toda massa é inválida e a Etapa 5 roda só para os pendentes (passou e não executável ficam). A massa roda sem `Bash` livre: consulta o banco só por `mapa-db` (SELECT, recusa produção, log em `.mapa-db.jsonl`) e só quando o banco está configurado. Todo `claude -p` do QA leva `--disallowedTools` (commit, push, merge, rebase, reset, clean, tag).
3. **Pergunta**: o Claude pergunta com `qa-state pausa` (vira `.pausa.json`); o cartão mostra a pergunta e as opções, a resposta vai para `.respostas.md` e o QA retoma citando-a.
4. **Evidência obrigatória**: `qa-state cenario CTnn concluir --status passou` é recusado sem evidência anexada (`qa-state evidencia`). Se o plano de mudança ou o `implementacao.md` grava em uma tabela e o cenário a cita, a evidência precisa incluir a consulta `.sql` (com o nome da tabela) e o arquivo `resultado-*` dela, ou o `consulta-*.txt` da jornada que cita a tabela.
5. **Massa por SQL**: sem registro que sirva, o Claude lê os valores originais por `mapa-db` e **propõe** um lote (`qa-state massa proposta`: INSERT/UPDATE/DELETE com WHERE, mais o SQL de desfazer). Ele nunca executa escrita. O cartão mostra o SQL, e só depois do seu Aprovar (e de um modal com a conexão e o ambiente) a extensão roda o lote numa transação só (erro desfaz tudo), pela conexão de Configurações → Banco de dados. Produção e conexão sem ambiente são recusadas. A massa fica com origem `sql` e o SQL de desfazer em `.massa.json`; tudo vai para `.massa-sql.log.jsonl`.
6. **Custo de tokens** (diagnóstico do WMS-14752, `infra/agentes/enxuto.js`): todo `claude -p` do QA roda sem servidores MCP, sem skills nem plugins (e os hooks e agentes deles) e só com as ferramentas da etapa, em `craftingTable.qaModelo` (padrão `sonnet`) e `craftingTable.qaEsforco` (padrão `medium`). A pré-condição não usa Claude: health check e login HTTP na API com o usuário do `~/.wms-testes.env` (o erro da API, como "senha bloqueada", aparece na hora); só sem credencial o login vai ao Claude, e o ok dele vale até o refresh enquanto o código não muda. O 6.1 escreve em lote os roteiros dos próximos pendentes (`craftingTable.qaLoteRoteiro`, padrão 6). A resposta a uma pergunta do roteiro continua a mesma sessão (`--resume`). A massa vencida só pelo horário do refresh é conferida no banco antes de buscar outra; ↻ Refazer massa só mexe nos pendentes e só descarta o que o banco reprova; a busca que não achou nada não se repete no mesmo dia. Limite de sessão do Claude retoma a fila sozinho no horário informado. A aprovação do UPDATE de massa é idempotente, e "ok"/"sim"/"aprovo" digitados abrem o modal de aprovação.
7. **Controle**: ▶/⏸ pelo mesmo componente do Ao vivo; execução interrompida (janela fechada, queda) é reconciliada ao retomar (cenário preso volta à fila); `craftingTable.qaTimeoutCenarioMin` (padrão 30) bloqueia o cenário que não termina.

Testes: `node extensao/janelas/qa/testes/teste-qa.js`, `node extensao/janelas/qa/testes/teste-esteira-qa.js`, `node extensao/janelas/qa/testes/teste-documento.js`, `node extensao/janelas/qa/testes/teste-jornada-qa.js`, `node extensao/janelas/qa/testes/teste-massa-qa.js`, `node extensao/testes/teste-ponta-a-ponta-documento.js`, `node extensao/testes/teste-acoes.js`, `node extensao/testes/teste-area-ia.js`. Claude simulado (`maestro.rodar` trocado; os argumentos reais do `claude -p` conferidos com um `claude` falso), `qa-state` real, rede bloqueada. Não cobrem o `claude -p` e a skill reais, nem o Jira real.

## Integração com a skill `testes-funcionais`

Sem modificar a skill. O hook `~/.claude/hooks/crafting-testes.py` observa os comandos Bash do Claude:

1. **`preparar-ambiente.py`** (a skill preparando o ambiente): antes de rodar, o hook resolve os worktrees com a etapa `refs` da própria skill e pede à Crafting Table:
   - emulador: liga o `craftingTable.avdPadrao` (padrão `Small_Phone`) se nenhum aparelho estiver conectado;
   - botões **API WMS-XXXX** e **Metro WMS-XXXX** em Configurações → Comandos, nos worktrees certos, com as mesmas variáveis da skill.

   O hook espera tudo responder (até 10 min). Depois, a skill reaproveita a API, o Metro e o aparelho.
2. **`executar.py --com-app` / `executar-jornada.py`**: grava a tela do emulador durante a jornada, emendando trechos de 3 min, nas evidências da conversa.
3. A aba **Evidências** mostra também as pastas da skill para o ticket: prints e vídeo do Maestro, e o consolidado (somente leitura).

Com o VS Code fechado, ou em qualquer erro, o hook não faz nada e a skill segue como sempre.

## Instalação

A extensão fica em `~/.vscode/extensions/crafting-table/` (id `local.claude-abas`, mantido para não perder o Cofre, o login do Jira e os botões).

Peças de fora do VS Code:

| Peça | Para quê | Onde |
|---|---|---|
| Hooks do Claude Code | pasta da conversa/ticket, Decisões e Notificações | `~/.claude/settings.json` + `~/.claude/hooks/documentos.py`, `decisoes.py`, `notificacoes.py` |
| Plugin `sdd` | Spec e modo refinamento | `sdd@crafting-local` |
| Hook da skill de testes | integração com `testes-funcionais` | `~/.claude/settings.json` (PreToolUse/PostToolUse Bash) + `~/.claude/hooks/crafting-testes.py` |
| Extensão do GNOME `claude-abas-janelas@local` | trazer o emulador para frente no Wayland | `~/.local/share/gnome-shell/extensions/` (vale depois de sair e entrar na sessão) |
| Android SDK | Evidências e Emuladores | `$ANDROID_HOME` ou `~/Android/Sdk` |

Bibliotecas: `@grpc/grpc-js` e `@grpc/proto-loader` (print do emulador).

## Desenvolvimento

Pastas: `janelas/` (módulos de ticket: Refinamento, Implementações, QA, Incidentes), `infra/` (lógica comum, por assunto), `componentes/` (tela comum), `painel/` (o painel do ticket), `modulos/` (seções Comandos, Evidências, Emulador, Cofre e Conversas), `configuracao/` e `public/` (`icones/` e `fonts/`: ícones do `package.json` e das telas, fontes das webviews e do `markdown.css`).

- Mudou o `package.json` (abas, ícones, nomes)? Feche o VS Code inteiro (`Ctrl+Q`) e abra de novo. O *Reload Window* não relê o manifesto.
- Mudou só `.js`? `Ctrl+Shift+P` → **Developer: Reload Window**.

## Comentário do Jira que muda a spec

O vigia olha os comentários dos tickets com spec a cada 5 min. Cada comentário novo passa por:

1. **Triagem** (só se há dúvida enviada ou pergunta aberta): o Claude diz se é *resposta* (só sugere; você confirma na aba Dúvidas ou no card da pergunta), *mudança* ou *ruído*.
2. **Análise** (só leitura): nível, passos e cards atingidos e até 3 opções. **A spec não é alterada.** Se a análise mexer nos arquivos, a extensão desfaz sozinha.
3. **Decisão**: caixa de borda vermelha acima do Ao vivo, passos e cards afetados ficam laranja com ⚠, e Aprovar/Continuar ficam travados (também no `sdd-state`). Opções: *aplicar* (snapshot + o Claude regride a spec), *manter*, *consultar* (vira dúvida para o PO) e **Não prosseguir** (descarta; depois de aplicar, **Desfazer** restaura o snapshot).
4. **Teams**: o card "Mudança pedida" sai para quem iniciou o refinamento (médio/alto). Como criar o `TEAMS_WEBHOOK`: [README da raiz](../README.md#avisos-no-teams-opcional) ou **⚙ Configurações → Teams → ⓘ**.

Testes: `node extensao/testes/teste-teams.js`, `node extensao/configuracao/teste-configuracao.js`, `node extensao/janelas/refinamento/testes/teste-mudancas.js`, `node extensao/janelas/refinamento/testes/teste-orquestrador.js`, `node extensao/janelas/refinamento/testes/teste-esteira-refinamento.js` (esteira do Refinamento por fatia, Claude simulado), `node extensao/janelas/refinamento/testes/teste-pacote.js`, `node extensao/janelas/refinamento/testes/teste-documento.js`, `node extensao/janelas/refinamento/testes/teste-hierarquia.js`, `node extensao/janelas/implementacoes/testes/teste-implementacoes.js`, `node extensao/janelas/implementacoes/testes/teste-documento.js`, `node extensao/janelas/implementacoes/testes/teste-esteira.js`, `node extensao/infra/dossie/teste-dossie.js`, `node extensao/infra/ticket/teste-contexto.js`, `node extensao/infra/ticket/teste-tipo-ticket.js`, `node extensao/infra/ticket/teste-documento-criar.js`, `node extensao/infra/provedores/teste-documento.js`, `node extensao/infra/agentes/teste-etapas.js`, `node extensao/janelas/qa/testes/teste-esteira-qa.js`, `node extensao/janelas/incidentes/testes/teste-esteira-incidente.js` (esteira do Incidente ponta a ponta, Claude simulado), `node extensao/janelas/incidentes/testes/teste-mergulho.js`, `node extensao/janelas/incidentes/testes/teste-reproducao.js`, `node extensao/janelas/incidentes/testes/teste-evidencias.js`, `node extensao/janelas/incidentes/testes/teste-documento.js`, `node extensao/componentes/teste-fluxo-passos.js`, `node extensao/componentes/teste-caixa-etapas.js`, `node plugin/plugins/sdd/teste-triagem.js`.

## Limitações conhecidas

- O **@** cola pela área de transferência (a extensão do Claude não tem API para escrever na conversa atual). A área de transferência volta ao conteúdo anterior logo depois.
- A colagem depende de tempo (0,3 s para abrir e 0,3 s para focar a caixa); numa máquina lenta o texto pode não entrar.
- Vídeos abrem no player do sistema: o VS Code não reproduz mp4.

## Criar um módulo novo

Copie `modelo-modulo/` e siga o `LEIA-ME.md` (6 pontos de registro). O padrão de lista, cabeçalho, menu e rodapé está em `../CLAUDE.md`.

Organização da pasta (etapas em `etapas/01-….js`, `abas/`, `bin/`, `testes/`, registro em `<modulo>.js`): veja `janelas/incidentes/`, `janelas/refinamento/`, `janelas/qa/` e `janelas/implementacoes/` e a seção "Pasta do módulo" (que também descreve as pastas de `infra/`) do `../CLAUDE.md`.
