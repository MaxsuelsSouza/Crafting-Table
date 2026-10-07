---
name: sdd
description: Spec Driven Development guiado em 7 passos (0 Constituição, 1 Especificação, 2 Clarificação, 3 Planejamento técnico, 4 Tarefas, 5 Análise de qualidade, 6 Implementação), com estado em specs/<feature>/sdd-state.json para retomar de onde parou e portões de revisão humana. Use quando o usuário rodar /sdd:iniciar ou /sdd:continuar, pedir para "iniciar/continuar a spec", ou estiver numa conversa de refinamento do tipo Spec da Crafting Table.
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
6. **Sem commit automático.** Deixe os arquivos prontos; quem commita é o humano (exceção: passo 6, ver abaixo).
7. Um pedido do humano de "mudar o comportamento" exige **atualizar a spec antes do código**.

## Protocolo de início (`/sdd:iniciar <pasta> [repo]`)

1. Leia `<pasta>/meta.json` (título, ticket). Se o repositório não veio no argumento nem em `meta.spec.repo`,
   **pergunte** em qual repositório a spec vai morar (ex.: `novo-wms-backend`, `wms-mobile`).
2. `sdd-state init --ref <pasta> --repo <repo>` → cria `specs/NNN-<slug>/` e o estado.
3. Siga para o **protocolo de retomada**.

## Protocolo de retomada (`/sdd:continuar <pasta>` — inclusive em conversa nova)

1. `sdd-state status --ref <pasta>` (ele recalcula hashes e aplica a cascata de edições feitas fora da conversa).
2. Leia **só** o arquivo do passo atual e o do passo anterior; o resto, sob demanda.
3. Se o passo 2 (clarificação) ou o 6 estiverem em andamento: `sdd-state json --ref <pasta>` para ver perguntas e tarefas.
4. Mostre ao humano o resumo do `status` (as 5 linhas) e pergunte **"sigo?"**. Não comece sem resposta.
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
- Se existir um modelo em `${CLAUDE_PLUGIN_ROOT}/modelos/<nome-do-repositório>.md`, use-o como base.
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
biblioteca, nome de classe. Use como insumo o ticket, `notas.html` e os handoffs da pasta do refinamento.

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

O **como**: tecnologias, contratos de API, modelo de dados, componentes por camada (backend/mobile), riscos.
Toda decisão referencia o RF que atende. Não altere requisito aqui — se faltar algo, diga e volte ao passo 2.

Obrigatório no fim: `## Conformidade com a Constituição` — tabela `Regra | Conforme/Viola | Evidência no plano`.
Qualquer **Viola** impede `concluir 3`: corrija o plano (a constituição prevalece).
`--resumo '{"tecnologias":["..."],"endpoints":N,"entidades":N,"violacoes":0}'`.

## Passo 4 — Tarefas (`tasks.md`)

Unidades pequenas, ordenadas e verificáveis, uma por linha de checklist:
`- [ ] t01 <objetivo> — RF01, RF02 — depende de: — pronto quando: <teste/comando que comprova>`

Cada tarefa cabe em **um commit**. Ordem topológica, sem ciclo. Todo RF coberto por ao menos uma tarefa;
toda tarefa aponta um RF (senão é órfã). `concluir 4`.

## Passo 5 — Análise de qualidade (`analise.md`) — **Portão Humano 2**

Cruze Constituição × Spec × Plano × Tarefas e registre cada problema com `sdd-state achado add`:
contradição entre arquivos · tarefa órfã (sem RF) · RF sem tarefa · violação da constituição · tecnologia vazando
na spec · critério de aceite não testável. Severidade `bloqueante` ou `aviso`.

`analise.md`: resumo, tabela de achados (Ann, severidade, tipo, onde, descrição) e cobertura RF → tarefas.
Corrija o que der (`achado resolver Ann`) e reconcilie os arquivos afetados. O humano pode aceitar um bloqueante
com justificativa (na conversa → `achado aceitar Ann --justificativa "..."`). `concluir 5`.
A aprovação só abre com **zero bloqueantes abertos**.

## Passo 6 — Implementação

Só com o passo 5 aprovado. Execute **uma tarefa por vez, na ordem**, sem pular dependência:

1. `sdd-state tarefa tNN --status em_andamento`.
2. Implemente seguindo plano e constituição; rode o "pronto quando" da tarefa.
3. Marque `- [x]` em `tasks.md` e faça **um commit por tarefa** (`feat(<escopo>): <objetivo> [tNN]`), com spec/tasks
   atualizados no mesmo commit — é a única exceção à regra de não commitar, e só se o humano autorizou commits
   nesta implementação (pergunte na primeira tarefa).
4. `sdd-state tarefa tNN --status feita --commit <sha>`.
5. Se a tarefa exigir comportamento que **não está na spec**: pare, registre `pergunta add`, e diga que é preciso
   voltar à clarificação. Spec antes do código.

Retomada: a próxima tarefa é a primeira não feita com dependências feitas; confira `git log --grep "\[tNN\]"`
para não refazer o que já foi commitado. Ao terminar todas: `concluir 6` → revisão humana final do código.
