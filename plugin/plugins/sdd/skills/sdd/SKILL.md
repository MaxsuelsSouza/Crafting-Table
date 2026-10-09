---
name: sdd
description: Spec Driven Development guiado em 7 passos (0 Constituição, 1 Especificação, 2 Clarificação, 3 Planejamento técnico, 4 Tarefas, 5 Análise de qualidade, 6 Plano de testes (QA)), com estado em specs/<feature>/sdd-state.json para retomar de onde parou e portões de revisão humana. Use quando o usuário rodar /sdd:iniciar ou /sdd:continuar, pedir para "iniciar/continuar a spec", ou estiver numa conversa de refinamento do tipo Spec da Crafting Table.
---

# SDD — Spec Driven Development

A fonte da verdade é a **especificação versionada no repositório**, não a conversa. Cada passo gera um arquivo
que alimenta o próximo. Você conduz; **o humano aprova** — sempre pela aba **Constituição** da Crafting Table.

## Regras que valem em todos os passos

1. **O estado só muda pelo `sdd-state`**: `${CLAUDE_PLUGIN_ROOT}/bin/sdd-state <comando> --ref <pasta do refinamento>`.
   Nunca edite `sdd-state.json` à mão (um hook bloqueia).
2. **Você nunca aprova.** `sdd-state aprovar` é exclusivo da extensão (bloqueado para você). Ao terminar um passo:
   `concluir N`, diga "Passo N pronto para revisão na aba Constituição" e **termine a resposta**. Não espere com
   comandos: um hook do plugin vigia a aba e **acorda você nesta conversa** quando o humano decidir:
   - "APROVADO" → **siga sozinho**: `iniciar` o próximo passo e trabalhe, sem pedir confirmação;
   - "PEDIU AJUSTE" → espere a instrução do humano, ajuste e `concluir N` de novo;
   - "DESATUALIZADO" → rode `status` e reconcilie a partir do passo indicado.
3. **Nunca pule passo** nem comece um passo com anteriores não aprovados (`iniciar N` recusa — respeite).
4. **A Constituição prevalece** sobre spec e plano. Divergência → a constituição vence; aponte o conflito.
5. **Contexto explícito**: nada de regra só na conversa. Toda decisão vai para o arquivo do passo.
6. **Sem commit automático.** Deixe os arquivos prontos; quem commita é o humano.
7. Um pedido do humano de "mudar o comportamento" exige **atualizar a spec antes do código**.
8. **Tirar dúvida (ticket em modo refinamento)**: toda pergunta com `AskUserQuestion` leva, como última opção,
   `Tirar dúvida` (descrição: "Não sei responder agora: levar a dúvida para o time/PO"). Use no máximo 3 opções
   próprias. Escolhida → `sdd-state duvida add --ref <pasta> --texto '<pergunta>' --contexto '<passo N, opções
   oferecidas e por que importa>'`; no passo 2 registre também com `pergunta add` (ela fica `aberta`). Diga
   "Registrada como Dnn na aba Dúvidas" e siga com o que não depende dela. **Dúvida sem resposta segura a spec**:
   `sdd-state iniciar` e a aprovação do passo recusam até o humano responder na aba Dúvidas (comentário do ticket
   confirmado ou "Dar resposta"). Você pode terminar o passo atual (`concluir`), mas não inicia o próximo. Respondida →
   a resposta aparece no `status` e vira regra no arquivo do passo.

## Modo segundo plano (mensagem com `[segundo plano]`)

A extensão Crafting Table roda você com `claude -p`, uma execução por etapa; o humano acompanha pela aba Spec e
responde por botões. Nessas execuções:
- **Não existe `AskUserQuestion`** e não há chat: nunca escreva "sigo?" nem espere resposta.
- **Pergunta** = `sdd-state pergunta add --ref <pasta> --texto '<pergunta>' --opcoes '["opção 1","opção 2"]'
  --contexto '<por que importa, 1 linha>'` (até 4 opções, a recomendada primeiro, terminando com "(Recomendado)").
  Pode registrar várias; depois **termine a execução** dizendo quantas registrou. A próxima execução traz as
  respostas (ou "Tirar dúvida": registre o ponto como em aberto no arquivo do passo e termine o passo; a spec só segue quando a dúvida for respondida).
- Trabalhe **só o passo atual**. Ao terminar: `concluir N` e **termine a execução** (não comece o passo seguinte:
  a extensão abre uma execução nova quando o humano aprovar).
- Prefira as ferramentas Read/Glob/Grep a comandos de shell para ler arquivos; um comando por chamada de Bash.
- **Narre para o humano** (ele lê a caixa "Ao vivo"; só a 1ª frase de cada texto aparece): antes de cada bloco de
  trabalho, **uma frase curta** em português dizendo o que vai fazer e para quê — "Vou ler o mapeamento para montar
  as regras do backend.", "Vou comparar o plano com a constituição." Sem markdown, sem caminho de arquivo, sem jargão
  de ferramenta. Ao terminar a execução, uma frase dizendo o que ficou pronto e o que o humano faz agora.

## Mudança vinda de comentário do Jira (mensagem com `[impacto]`) — **só análise**

O vigia da Crafting Table viu um comentário novo de outra pessoa (PO, QA, dev) no ticket que a triagem classificou como
mudança (ou que não havia o que triar) e te passa id, autor, data, link e texto. Seu trabalho: medir o impacto e
**propor opções**. **Não edite spec, plano, tarefas, testes nem cards, e não rode `check`**: nada muda até o humano
escolher na caixa vermelha da aba Spec. Você também não escreve no Jira.

1. Compare o comentário com `spec.md` (RFs, critérios, fora de escopo, clarificações), `plan.md`, `tasks.md`,
   `testes.md` e os cards (os aprovados têm a chave do Jira).
2. **Nível**: `nenhum` (conversa, status, agradecimento) · `baixo` (ajuste pontual sem mudar RF: texto, exemplo,
   nome) · `medio` (muda um RF, critério de aceite, campo ou contrato) · `alto` (muda escopo, regra central ou
   fluxo; inclui/remove RF; troca camada).
3. Registre: `sdd-state impacto registrar <id> --ref <pasta> --nivel … --resumo '<o que muda, 1–2 frases>'
   --passo <primeiro passo afetado> --cards <ids afetados, ex. t02,t05,qa> --opcoes '<JSON>'`.
   Nível `nenhum` → termine aqui (sem `--opcoes`).
4. `--opcoes`: 1 a 3 itens `{"rotulo":"<texto do botão, ligado ao comentário>","tipo":"aplicar|manter|consultar","instrucao":"<o que fazer>"}`.
   - `aplicar`: regride a spec com a mudança (a instrução diz como, ex. "trocar a cor do botão para vermelho nos RFs e testes");
   - `manter`: nada muda na spec (o humano responde no ticket por fora);
   - `consultar`: vira uma dúvida para o PO (a instrução é o texto da pergunta; a spec espera a resposta).
   A recomendada primeiro, terminando com "(Recomendado)". "Não prosseguir" **não** entra: a extensão acrescenta.
5. Termine com uma frase: nível, o que mudaria e quais passos/cards seriam atingidos. Ela aparece no Ao vivo.

## Aplicar a mudança escolhida (mensagem com `[aplicar]`)

O humano escolheu uma opção do tipo `aplicar` (a mensagem traz id, autor, link, texto do comentário, o rótulo e a
instrução da opção). A extensão já guardou um snapshot para desfazer. Agora sim, regrida:

1. Aplique a mudança no **primeiro artefato afetado** (spec.md se muda RF/regra; plan.md se só a parte técnica;
   tasks.md/testes.md se só tarefa/teste), com nota datada: `> Mudança de <data> — comentário de <autor> (<link>):
   <o que mudou>`. Rode `sdd-state check`: o passo editado volta para revisão e os seguintes ficam desatualizados.
   **Não** reconcilie os passos seguintes agora (isso acontece quando o humano reaprovar).
2. Cards atingidos: ainda pendentes → `card editar`; **já aprovados (no Jira)** → `card revisar tNN --ref <pasta>
   --motivo '<a mudança> (comentário de <autor>)' --comentario <link> --descricao '<descrição nova completa>'`
   (e `--titulo`/`--pronto`/`--estimativa` se mudarem). Card `qa` aprovado → ajuste `testes.md` e
   `card revisar qa --motivo … --comentario <link>`.
3. Feche: `sdd-state impacto aplicado <id> --ref <pasta> --resumo '<o que mudou, quais passos voltaram, quais subtarefas revisar>'`
   e termine com essa frase.

## Triagem de comentário novo do Jira (mensagem com `[triagem]`)

A mensagem traz um comentário novo (id, autor, link, texto), as dúvidas `Dnn` já enviadas ao ticket sem resposta e as
perguntas `Qnn` ainda abertas. **Só leitura**: não edite spec, plano, tarefas nem cards. Seu trabalho é dizer o que o
comentário é, antes de qualquer análise de impacto.

1. **resposta** — decide, de fato, o ponto de uma dúvida/pergunta listada (mesmo assunto, resposta clara). Conversa,
   status, agradecimento ou resposta parcial/vaga **não** contam.
2. **mudanca** — altera algo que a spec já assume (requisito, critério, campo, contrato, regra, escopo), mesmo que
   também responda uma dúvida. Em caso de dúvida entre resposta e mudança, escolha `mudanca`.
3. **ruido** — conversa, status, agradecimento, nada a decidir.
4. Registre uma vez: `sdd-state comentario classificar <id> --ref <pasta> --tipo resposta|mudanca|ruido
   --motivo '<1 frase>' [--duvida Dnn | --pergunta Qnn]` (`resposta` exige `--duvida` ou `--pergunta`; em `mudanca`
   que também responde algo, informe o `--duvida`/`--pergunta` para a sugestão não se perder).
5. Você só **sugere** a resposta: quem confirma é o humano (aba Dúvidas ou card da pergunta). `mudanca` segue sozinha
   para a análise de impacto em outra execução. Termine com uma frase.

## Protocolo de início (`/sdd:iniciar <pasta> [repo]`)

1. Leia `<pasta>/.ticket.json` (ticket: titulo, link) ou `<pasta>/meta.json` (refinamento antigo). Se o repositório não veio no argumento nem em `meta.spec.repo`,
   **pergunte** em qual repositório a spec vai morar (ex.: `novo-wms-backend`, `wms-mobile`).
2. `sdd-state init --ref <pasta> --repo <repo>` → cria `<CHAVE>-<slug>/` na raiz do repositório de specs (ticket) ou `specs/NNN-<slug>/` (refinamento antigo) e o estado.
3. Siga para o **protocolo de retomada**.

## Protocolo de retomada (`/sdd:continuar <pasta>` — inclusive em conversa nova)

1. `sdd-state status --ref <pasta>` (ele recalcula hashes e aplica a cascata de edições feitas fora da conversa).
2. Leia **só** o arquivo do passo atual e o do passo anterior; o resto, sob demanda.
3. Se o passo 2 (clarificação) ou o 6 estiverem em andamento: `sdd-state json --ref <pasta>` para ver perguntas e tarefas.
4. Mostre ao humano o resumo do `status` (as 5 linhas) e pergunte **"sigo?"**. Não comece sem resposta.
   **Exceção — ticket em modo refinamento** (`<pasta>/.ticket.json` com `refinamento.estado`): quem decide é o botão
   do ticket, não o chat. `aguardando_inicio` ou `pausado` → **não pergunte**: diga "Spec iniciada em `<dir>` (<CHAVE>).
   Clique em **Dar início** no ticket." (ou "▶ no ticket para retomar") e termine a resposta — o hook acorda você.
   `rodando` → siga sem perguntar.
5. **Não repita perguntas**: perguntas `respondida`/`descartada` e a seção "Clarificações" da spec são fatos.
   Antes de perguntar algo, confira se uma Qnn já cobre o tema — se cobre, cite "Q04 já respondeu: …".
6. Passo `desatualizado`: **reconcilie**, não refaça do zero — compare com o que mudou no passo de origem
   (o `motivoDesatualizado` diz qual) e proponha só as alterações necessárias; depois `concluir N`.

Ciclo de cada passo: `iniciar N` → trabalhar → gravar o arquivo → `concluir N [--resumo '{...}']` → terminar a
resposta → (o hook acorda você quando aprovado) → próximo passo automaticamente.

**Mudou um arquivo já aprovado** (ex.: no passo 2 você percebe que a constituição precisa de ajuste)? Não siga adiante:
1. Edite o arquivo e rode `sdd-state check --ref <pasta>` — o passo editado volta a `aguardando_revisao` e os que
   dependem dele ficam `desatualizados`.
2. Diga ao humano o que mudou e por quê, e que ele precisa **reaprovar o passo N** na aba.
3. Termine a resposta; o hook acorda você quando ele reaprovar. Aprovado → reconcilie os desatualizados em ordem.

---

## Passo 0 — Constituição (`<repo>/constitution.md`)

Leis universais e imutáveis do repositório. **Mais importante que dizer o que fazer é dizer o que NÃO fazer.**

- Se `constitution.md` existe: valide contra as seções abaixo; proponha só o que falta. Se está completa, `concluir 0`.
- Se não existe mas há `.specify/memory/constitution.md` (spec-kit): proponha importar.
- Repositório de specs do WMS (`WMS/specs`, sem `constitution.md`): a base é **só**
  `${CLAUDE_PLUGIN_ROOT}/modelos/constituicao-wms-mapeamento.md` (levantamento do código de `novo-wms-backend` e
  `wms-mobile`, com evidência). **Nada da wiki**: ela tem informação desatualizada. Monte o `constitution.md` assim:
  1. Esqueleto comum (seção 1 do mapeamento) + princípios do backend (seção 2) + do mobile (seção 3), cada regra
     com a evidência entre parênteses; a seção 4 (diferenças) vira regras parametrizadas por repositório.
  2. Cada conflito marcado "decidir antes de ratificar": **uma pergunta por vez** (`AskUserQuestion`, opções do
     próprio mapeamento + `Tirar dúvida`). Resposta → vira regra. Tirar dúvida → `duvida add` e o conflito fica na
     seção final **"Em aberto"** (não vira regra).
  3. A seção 0 do mapeamento (urgente, fora da constituição) **não entra**: avise o humano dela uma vez.
  4. Pergunte se quer **acrescentar** regras próprias; depois `concluir 0`.
- Outros repositórios do WMS que já têm `constitution.md`: valide contra as seções abaixo e proponha só o que falta.
- Senão: entreviste (uma pergunta por vez) **lendo o repositório antes** (pastas, testes existentes, padrão de commits)
  para propor respostas, não perguntar no escuro.

Seções obrigatórias, cada uma com regras **verificáveis** e uma lista **"Proibido"**:
Arquitetura e organização de pastas · Testes (obrigatoriedade e **cobertura mínima numérica**) · Segurança
(autenticação; autorização por claims/policies em vez de roles) · Dados (datas e horas **sempre em UTC**) ·
Nomenclatura (arquivos, variáveis, classes) · Versionamento e commits (fluxo Git, Conventional Commits).
Feche com a cláusula: "Em divergência com spec.md ou plan.md, esta Constituição prevalece."

`--resumo '{"secoes":6}'`.

## Passo 1 — Especificação (`spec.md` v1.0)

O **o quê** e o **porquê**. **Proibido citar tecnologia**: framework, linguagem, banco, tabela, endpoint, fila,
biblioteca, nome de classe. Use como insumo o ticket, `notas.html` e as análises (`mapa-*.md`) se existirem.

Estrutura: `# <título> — Especificação v1.0` · `## Intenção` (problema, para quem, por quê) ·
`## Histórias de usuário` (`### História N`: Como <papel>, quero <ação>, para <benefício>) ·
`## Requisitos funcionais` (`RF01`, `RF02`… cada um com **Critério de aceite** Dado/Quando/Então) ·
`## Casos de borda` · `## Fora de escopo`.

Regra de ouro: **se não dá para derivar um teste do requisito, ele não é requisito** — reescreva ou remova.
Antes de `concluir 1`, releia procurando nome de tecnologia e RF sem critério de aceite.

## Passo 2 — Clarificação (`spec.md` v2.0) — **Portão Humano 1**

1. Leia a spec e liste ambiguidades (termos vagos, regra sem limite, caso de borda sem comportamento, conflito entre RFs).
2. Para cada uma: **registre antes de perguntar** — `sdd-state pergunta add --texto "<pergunta>" --rf RF03` → Qnn.
3. Pergunte **uma por vez**, com opções quando fizer sentido. Resposta → `pergunta responder Qnn --resposta "..."`
   e atualize a spec. Se o humano disser que não importa → `pergunta descartar Qnn`.
4. Não invente resposta: o que não foi respondido continua aberto.
5. Ao final: suba o cabeçalho para v2.0 e acrescente `## Clarificações` (Qnn → resposta → RF afetado).
6. `concluir 2 --versao 2.0`. O humano só consegue aprovar com **zero perguntas abertas**.

## Passo 3 — Planejamento técnico (`plan.md`)

**Primeiro o mapeamento do código** (obrigatório, antes de escrever o plano): decida as camadas (backend,
mobile ou as duas) pela spec, leia o código real e grave uma análise por camada na **pasta da spec** (`~/.claude` é bloqueada para gravação)
(`mapa-backend.md` / `mapa-mobile.md`, aba Análise). No modo refinamento em segundo plano o maestro
carrega o plugin **`mapa`**: siga a skill **`mapa:mapear`** (camadas, ref de leitura, inventário invertido por
RF, escada de mudança, chamadores, verificações e evidência conferida com `mapa-conferir`). Sem o plugin,
faça o mesmo à mão: nada de plano sem ter lido onde a spec toca o código.

O **como**: tecnologias, contratos de API, modelo de dados, componentes por camada (backend/mobile), riscos.
O `plan.md` **abre** com `## Mapeamento do código` (camadas, ref de leitura, resumo e os arquivos `mapa-*.md`)
e cada decisão cita o RF que atende e o `arquivo:linha` que reaproveita ou altera.
Não altere requisito aqui — se faltar algo, diga e volte ao passo 2.

Obrigatório no fim: `## Conformidade com a Constituição` — tabela `Regra | Conforme/Viola | Evidência no plano`.
Qualquer **Viola** impede `concluir 3`: corrija o plano (a constituição prevalece).
`--resumo '{"tecnologias":["..."],"endpoints":N,"entidades":N,"violacoes":0}'`.

## Passo 4 — Tarefas (`tasks.md`)

Unidades pequenas, ordenadas e verificáveis, uma por linha de checklist:
`- [ ] t01 <objetivo> — RF01, RF02 — depende de: — pronto quando: <teste/comando que comprova>`

Cada tarefa cabe em **um commit**. Ordem topológica, sem ciclo. Todo RF coberto por ao menos uma tarefa;
toda tarefa aponta um RF (senão é órfã).

**Ticket da Crafting Table**: cada tarefa também vira um **card** (vira subtarefa no Jira quando o humano aprova):
`sdd-state card add tNN --ref <pasta> --titulo '<objetivo curto, até 80 caracteres>' --descricao '<o que fazer, onde
(arquivos/módulos), regras da spec que se aplicam; texto corrido em português>' --rf RF01,RF02 --depende t01
--pronto '<critério verificável>' --camada backend|mobile --estimativa <sugestão: 30m, 2h, 1d>`.
Depois `concluir 4`. O humano aprova, reprova ou **pede alteração** card por card; um pedido de alteração chega
como "Pedido de alteração na tarefa tNN: …" → ajuste a linha em `tasks.md` **e** o card com
`sdd-state card editar tNN …` (só os campos que mudam) e termine a execução. Nunca mexa em card aprovado/reprovado.

## Passo 5 — Análise de qualidade (`analise.md`) — **Portão Humano 2**

Cruze Constituição × Spec × Plano × Tarefas e registre cada problema com `sdd-state achado add`:
contradição entre arquivos · tarefa órfã (sem RF) · RF sem tarefa · violação da constituição · tecnologia vazando
na spec · critério de aceite não testável. Severidade `bloqueante` ou `aviso`.

`analise.md`: resumo, tabela de achados (Ann, severidade, tipo, onde, descrição) e cobertura RF → tarefas.
Corrija o que der (`achado resolver Ann`) e reconcilie os arquivos afetados. O humano pode aceitar um bloqueante
com justificativa (na conversa → `achado aceitar Ann --justificativa "..."`). `concluir 5`.
A aprovação só abre com **zero bloqueantes abertos**.

## Passo 6 — Plano de testes (QA) (`testes.md`) — **Portão Humano 3**

Só com o passo 5 aprovado. **Não se implementa código aqui**: o refinamento é distribuído e quem pegar cada
subtarefa implementa a partir da spec. Este passo entrega o **plano de testes** da atividade inteira, que vira a
subtarefa `[QA]` no Jira quando o humano aprovar o card na aba Tarefas.

**Método:** o do plugin **`fcx-qa-test-planning:jira-qa-planner`** — leia o `SKILL.md` dele (Passos 3, 6 e 7) e
`reference/test-plan-templates.md` nos caminhos que a mensagem do maestro informa. **Não** execute os passos de
Jira/twg dele (2, 4, 5, 8): quem fala com o Jira é a extensão.

**Insumo é todo o refinamento**, não só a história: `spec.md` (RFs e Dado/Quando/Então), `plan.md` (endpoints,
contratos, dados), `mapa-backend.md`/`mapa-mobile.md` (chamadores → regressão), os cards de dev aprovados
(arquivo de cards da pasta do ticket: subtarefas com a chave do Jira) e as dúvidas em aberto (viram riscos).

1. **Modelo** (Passo 6 do jira-qa-planner): fluxo/tela/regra → Template A; endpoint/API/contrato → Template B;
   os dois → Template A com a seção de API do B.
2. **Escreva `testes.md`** no padrão do Passo 7: PT-BR, `CT01…` sequencial, Gherkin com **Dado que**/**Quando**/**Então**
   em negrito, `📌 Validações:` com `✔`, mínimo 1 positivo + 1 negativo + 1 borda **por RF**. Cada CT cita o
   **RF** que prova e a **subtarefa de dev** (WMS-xxxx ou tNN). Acrescente **regressão nomeada** a partir dos
   chamadores do mapeamento. Item sem base na spec: `⚠️ (inferido)`. O arquivo **se sustenta sozinho**: ele é a
   descrição da subtarefa [QA] (quem testa não vê a spec).
3. **Estimativa** (modo detalhado do `fcx-qa-test-planning:test-estimation`, `reference/modelo-estimativa.md`):
   horas de teste a partir dos CTs, no formato do Jira (ex.: `6h`).
4. **Card [QA]**: `sdd-state card add qa --ref <pasta> --titulo '<nome>' --arquivo <spec>/testes.md --estimativa <h>
   --resumo '<2 linhas: nº de CTs, RFs cobertos, camadas>'`. Nome pelo tipo do ticket (Passo 3 do jira-qa-planner):
   História → `[QA] Planejamento dos Casos de Testes`; outros → `[QA] Teste de Qualidade`.
5. `concluir 6`. Pedido de alteração no card `qa` → ajuste `testes.md` e rode `sdd-state card editar qa --ref <pasta>`
   (com `--estimativa`/`--resumo` se mudarem).
