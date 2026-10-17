# Crafting Table

Extensão do VS Code ao lado do Claude Code, com o ticket no centro. Código em `extensao/`; visão geral em `README.md`. Módulos de ticket em `extensao/janelas/`, lógica comum em `extensao/infra/`, tela comum em `extensao/componentes/` e arquivos estáticos (ícones e fontes) em `extensao/public/` (`icones/`, `fonts/`).

## Padrão de módulo

Todo módulo da lista de tickets (Refinamento, Implementações, QA, Incidentes e os próximos) nasce com o que está abaixo.
**Não redesenhe estas peças por módulo**: use os componentes de `extensao/componentes/`. Molde pronto para copiar: `extensao/modelo-modulo/` (módulo + checklist de registro).

### Lista de tickets (`componentes/lista-tickets.js`)

De cima para baixo:

1. Menu de módulos (`menu-modulos.js`)
2. Barra: **pesquisa** → **↑↓ (sort)** → **＋ Ticket**; o **contador de tickets** fica logo acima do botão
3. Cards dos tickets (`card-ticket.js`), seguidos do card **Sem ticket**
4. Caixa **Vinculados a você** (`vinculados.js`): só aparece com a "Ferramenta de gestão de trabalho" cadastrada (`lista.js`, `avaliarFerramenta`)

### Ticket aberto (`painel/moldura.js`, `cabecalho`)

Linha 1, da esquerda para a direita: **←** voltar · **título** · (direita) **▶/⏸** · **✦ abrir agente** · **⚡ raio** · **🎫 ticket** · **🗑 excluir**
- Os botões são do componente `botoes-ticket.js`: uma flag por botão (`visiveis`) e `extras` para acrescentar outros. Não desenhe botão do cabeçalho à mão.
- ✦ abre a conversa vinculada ao ticket. **Meta (ver plano de ajuste):** sempre a mesma conversa, com tooltip genérico (não só "Claude"). Hoje abre a mais recente do módulo.
- ⚡ sempre ativo: injeta um prompt na sessão aberta no Ao vivo (`maestro.instruir`); sem sessão, abre uma nova com o prompt (`maestro.rodar`).
- `cabecalho-ticket.js` existe (monta o `<header>` com esses botões) mas **ainda não é usado**: o cabeçalho em uso é `cabecalho()` da `moldura.js`.

Linha 2: **pill de status** do ticket (`pill.js`) e o botão **⟳ atualizar**.
Linha 3: **menu** (`menu-abas.js`): `Docs · Central · Ticket · Decisões | Conversas`. Aba extra do módulo entra entre Central e Ticket.
- **Central** é um nome genérico: toda aba de módulo tem essa vaga (id `central`) e o nome mostrado pode ser outro. Por padrão só a caixa **Ao vivo** (`aba-central.js` → `ao-vivo.js`).
- Os módulos que já existem **não foram migrados** para esse menu (ver `FAZER-QUANDO-DER.md`).

### Rodapé (`componentes/rodape.js`)

Em todas as telas do ticket: 🔔 **Notificações** e ▶ **Comandos**. Não é por módulo; o que um módulo acrescenta depois de Comandos vem do gancho `rodape(dir, acao)` do registro (hoje só o QA: caixa do Ambiente).

### Vigia (global, `extensao/infra/agentes/vigia.js`)

Observador de toda execução em segundo plano (`maestro.rodar`); módulo novo não precisa fazer nada.
- Mais de 2 min só lendo/buscando, sem gravar nem executar: abre uma caixa com o que está acontecendo, 3 opções e "Outra resposta…"; a escolha vira instrução para o Claude.
- Mais de 3 cliques no ▶ em 1 min sem o Ao vivo andar: caixa de "parece travado" (esperar, seguir de onde parou, parar).
- O ▶ do módulo precisa passar por `aoVivo.controle` (é onde o vigia aprende o nome da ação).

### Branches (QA, Incidentes, Implementações)

Todo git dos repositórios de código passa por `extensao/infra/git/` (`localizar`, `padrao-branch`, `trocar`, `destacar`). Nenhum módulo faz checkout à mão.

- **Quem troca de branch:** só a Implementação. QA e Incidentes leem pela ref (`mapa-git show/log -p`); o Incidente confere a principal antes de ler (pausa "branch") e, se você mandar trocar, passa por `garantirPrincipal`.
- **Principal:** vem da configuração (`branchPrincipal` de cada repositório; o `origin/HEAD` não serve: no backend aponta para `master`). A volta para a principal é na **entrada** de cada execução (`garantirPrincipal`), não no fim: a esteira termina com alterações não commitadas.
- **Proteções** (`trocar.js`; qualquer uma vira pausa e nada é mexido): repositório sujo, branch presa em outro worktree, worktree da esteira de outro ticket (`~/.cache/crafting-table/worktrees/<CHAVE>/`) e execução viva de outro ticket no mesmo repositório (dono em memória).
- **Onde está o código do ticket** (`localizar`): fetch → branches candidatas (`craftingTable.branchesCandidatas`, padrão `pre-releases/*`, `releases/*`; `log --grep` da chave, pega cherry-pick e squash) → principal → branch com a chave no nome → qualquer ref remota com um commit da chave. `escolher`: nada → pergunta; mesma família → a mais recente; empate → pergunta. Bug e incidente reproduzem na principal; achado em homologação, na candidata (`refParaReproduzir`).

**Nome:** uma branch por ticket, `<prefixo>/<CHAVE>`, **sem slug**. O prefixo é o mais usado no repositório (últimas 300 branches remotas) entre os candidatos do tipo do ticket (`padrao-branch.js`); sem histórico, o primeiro:

| Tipo do ticket | Candidatos |
|---|---|
| História | `story`, `feature` |
| Tarefa | `task`, `feature` |
| Melhoria | `reform`, `feature` |
| Épico, feature | `feature` |
| Bug e bug experimental | `bugfix`, `fix` |
| Incidente | `hotfix` |
| Não reconhecido | a esteira pausa e pergunta; a resposta vira a categoria do ticket (nunca adivinhe) |

**Implementações** (`janelas/implementacoes/etapas/05-implementacao/regras/`):
- A branch do ticket já existe (`<qualquer prefixo>/<CHAVE>`, local ou `origin`) → usa, sem perguntar.
- Senão **sempre pergunta antes de criar** (pausa `criar`): "Criar `<nome>` a partir de `<base sugerida>`", "Partir da principal" e as outras bases achadas; texto livre = outro nome. Base sugerida (`base-branch.js`): branch com trabalho do ticket ou de subtarefa (`infra/dossie/trabalho-existente.js`), senão a do pai, senão a do avô, senão `origin/<principal>`. Criar = fetch + `checkout -b <nome> --no-track <base>`.
- Ticket com subtarefas usa a chave e o tipo do pai; subtarefa não ganha branch própria e todos os grupos de subtarefas são implementados dentro dela.
- Paralelo (no máximo 2 grupos): o segundo grupo roda num `git worktree` **destacado** (`--detach`) do HEAD da branch do ticket, sem branch nova; ao terminar, a extensão aplica a diferença dele nela. Grupos que dependem um do outro rodam em sequência na própria branch.
- A esteira não faz commit, push nem merge (vale também para o worktree).
- **Reprodução (bug e incidente, etapa 1, `01-dossie/subetapas/1.2` a `1.6`):** antes de corrigir, confirma o cenário: evidências (anexos + quadros dos vídeos pelo ffmpeg + `evidencias-ticket.md`), roteiro com a fonte de cada passo, `checkout --detach` no commit de `refParaReproduzir` (`infra/git/destacar.js`; o HEAD de antes volta no fim da 1.6 ou ao retomar), ambiente de pé com o sha conferido, execução com print e vídeo por cenário e veredito (`infra/reproducao/veredito.js`): REPRODUZIDO segue; NÃO REPRODUZIDO e INCONCLUSIVO pausam (tentar de novo, pedir dados no Jira, seguir sem confirmar; encerrar). O pedido de dados é o único ponto que escreve no Jira, e só publica com a sua aprovação; tipo não reconhecido pausa antes; o Mergulho que já reproduziu dispensa.

### Teste na aplicação (Implementações, etapa 07)

05 Implementação → 06 Verificação → **07 Teste na aplicação** (`etapas/07-teste/`) → 08 Resumo. A 07 sobe a aplicação (`infra/ambientes`), cria os CTs (plano do QA se servir, senão `METODO_ENTREGA`; **não publica no Jira**), executa cada um com **print e vídeo** e dá um **score 0–5** (`regras/score.js`, menor teto vence) contra o **mínimo** da atividade (`regras/minimo.js`: incidente/bug 4, bug experimental/outro 3; prioridade ±1; área sensível +1; entre 2 e 5). Score ≥ mínimo segue sem portão; abaixo: causa de código volta uma vez para a 05 (`correcao: 'teste'`), senão pausa. Grupos de subtarefas pulam; roda uma vez no pai.

### Pasta do módulo

Cada módulo de ticket mora em `extensao/janelas/<modulo>/`. Tudo que é só do módulo mora na pasta dele; o que serve a 2+ módulos vai para `componentes/` (tela) ou `infra/` (lógica). Exemplos prontos: `extensao/janelas/incidentes/`, `extensao/janelas/refinamento/`, `extensao/janelas/qa/` e `extensao/janelas/implementacoes/`.

`infra/` é organizada por assunto, uma pasta por assunto (o que não tem tela):
- `ticket/`: o ticket no disco e a conversa ligada a ele (`tickets.js`, `pasta-ticket.js`, `pastas.js`, `sessao.js`, `situacao.js`, `spec.js`, `contexto.js`…)
- `dossie/`: o dossiê do ticket (Implementação e QA) e a régua de confiança
- `provedores/`: a ferramenta de gestão de trabalho (contrato, `jira/`, documento, credenciais, variáveis) e a `fachada.js` que o resto da extensão usa
- `agentes/`: o agente de IA (agente ativo, plugins e skills, vagas das etapas, `maestro/` = `claude -p`, `vigia.js`, área de escrita da IA, banco para a IA)
- `git/`: branches e busca do commit nos repositórios de código (`localizar`, `padrao-branch`, `trocar` com as proteções); ver "Branches"
- `ambientes/`: onde a aplicação roda para testar (`emulador`, `aparelho`, `web`; registro e contrato no `index.js`, `escolher.js`, `aplicacao/` com os papéis API/Metro/Start/web, `android/` com adb, Maestro e bipe); ambiente novo = 1 pasta
- `reproducao/`: confirmar o cenário de bug/incidente (prompt de extração dos artefatos, quadros dos vídeos pelo ffmpeg, veredito REPRODUZIDO · NÃO REPRODUZIDO · INCONCLUSIVO)
- `integracoes/`: Teams (`teams/`) e a ponte com a skill testes-funcionais
- `testes/`: o plano de casos de teste (CT01…) vindo do plugin jira-qa-planner: método, parser (criticidade e tipo), nível, Template B (API), estimativa e nome da subtarefa [QA]
- `plugins/`: os plugins do Claude Code que a extensão passa por `--plugin-dir` (`mapa`, `foco`)
- na raiz, só o que é geral e pequeno (`texto.js`, `controle.js`). Tela (CSS, folhas, host de views) não mora em `infra/`: vai para `componentes/` ou `painel/`.

- `<modulo>.js`: o registro (ID, abas, ▶, ações, script, filtro da busca, artefatos da conversa…). Os pontos comuns leem daqui, sem `if` com regra do módulo. Sem `require` no topo (é carregado cedo).
  Ganchos opcionais (o painel chama se o módulo tiver; hoje o Refinamento, o QA e a Implementação): `dadosAba`, `antesDaAba`, `aoDesenhar`, `observar`, `pill`, `faixa`, `contadorAba`, `situacao`, `selos` (pills extras no card da lista; Implementação: "5 subtarefas"), `pedidoConversa`, `iniciar`, `aoAtualizar`, `CSS()`, `rodape` (caixa depois de Comandos) e `evidencias` (bloco na seção Evidências). A lógica deles fica num arquivo do módulo (ex.: `janelas/refinamento/ganchos-painel.js`, `janelas/qa/situacao.js`), o registro só repassa.
  Se o nome `<modulo>.js` já era a lógica (caso do QA), a API antiga vira um arquivo que só reexporta (`janelas/qa/motor.js`) para o `bin/`, as ações e os testes. O mesmo vale para o arquivo único que foi dividido (`janelas/implementacoes/esteira.js`, usado só pelos testes).
- `orquestrador/` (um arquivo por regra: rodar, pausar, aprovar, retomar, responder…; `index.js` exporta) e `estado.js`: o que é comum a todas as etapas.
- `etapas/`: `index.js` com a lista das etapas (dados) e **um arquivo por etapa**, numerado: `01-triagem.js`, `02-…`. Cada etapa exporta só os ganchos dela (`tarefa`, `antes`, `depois`, `responder`…; ver o `orquestrador/index.js`).
  Etapa grande vira pasta com o mesmo nome (`05-reproducao/`): `index.js` (encadeia), `subetapas/` (`5.1-plano.js`…), `regras/` e `dependencias.js`.
- `abas/` (telas), `bin/` (scripts que o Claude chama), `testes/` (`teste-*.js`).
- Formatação: Prettier (`extensao/.prettierrc.json`), hoje só em `janelas/` (os módulos de ticket; `.prettierignore`). Mexeu lá? `npm run formatar` em `extensao/` (`formatar:conferir` só confere).

### Arquivos pequenos (sempre, em código novo ou alterado)

Não crie arquivo "robusto" que junta várias regras. Vale para módulo novo, para código novo em módulo antigo e para o que você mexer.

- **Um arquivo = uma regra/assunto.** Arquivo que passa de ~150 linhas ou mistura assuntos (prompt + execução + tela + validação) vira pasta com `index.js` (só encadeia e exporta) e um arquivo por regra. Exemplos: `janelas/incidentes/orquestrador/`, `janelas/incidentes/etapas/05-reproducao/`, `janelas/refinamento/abas/spec/`, `janelas/refinamento/pacote/`.
- Prompt, regra de validação, dependências externas (VS Code, banco, emulador) e tela ficam em arquivos separados.
- `require('./pasta')` continua funcionando quando o arquivo vira pasta (`index.js`): quem usa não muda.
- Arquivos que se chamam em ciclo fazem o `require` um do outro dentro da função, não no topo.
- Lógica que outro módulo também usa não mora em módulo nenhum: vai para `infra/` ou `componentes/`.
- Antes de reestruturar algo que já existe, mostre a árvore proposta e espere o ok. Ao mover, mova o código como está (sem reescrever textos de prompt nem o estilo).

### Regras

- Peça nova que se repete em 2+ módulos vira componente em `componentes/` (cabeçalho do arquivo: o que é, onde é usado, como usar), nunca cópia.
- Registro do módulo nos 6 pontos comuns: ver `extensao/modelo-modulo/LEIA-ME.md`.
- O que ficou para depois (migração, registro único, troca do cabeçalho…): `FAZER-QUANDO-DER.md`.
- Atualizou o padrão aqui? Atualize também `extensao/modelo-modulo/`, `README.md` e `extensao/README.md`.
