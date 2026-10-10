
# Plano de execução por etapas

Regra: **uma etapa = um commit**, um módulo inteiro por vez (como QA, Implementações e Configurações). O painel nunca fica quebrado entre etapas.

## O que já facilita

- Os botões chamam ação **pelo nome** (`data-acao` / `data-painel` → `acoes[nome]`, linha 1920). Mover um handler não muda o HTML.
- Só `refinamento/teste-mudancas.js` importa `painel._teste` (`caixaDecisao`, `caixaMudancas`, `telaConstituicao`, `telaTarefas`, `cabecalho`). Ao mover cada função, o teste muda o `require`.
- Verificação disponível: os `teste-*.js` (rodar com `node`) e `npm run tipos` (tsc).

## Por que o Orquestrador vem antes do Refinamento

`mudancaDecidir`, `tarefaAlterar`, `specAprovar`, `responder` e `fecharDuvida` chamam `etapa` e `seguir`. Se os handlers saíssem antes, cada um precisaria de um atalho provisório para o Maestro que ficou no painel. Por isso o Maestro sai **antes** dos handlers do Refinamento.

## Etapas

| # | Etapa | O que sai do painel | Risco | Tempo | Como verificar |
|---|---|---|---|---|---|
| 0 | Rede de segurança | nada: criar `teste-acoes.js` (todo `data-acao`/`data-painel` do código tem handler) e anotar o resultado atual de testes e tsc | baixo | 15 min | testes + tsc verdes antes de começar |
| 1 | Base compartilhada | `IC`, `markdown`, `quando`, `iniciais`, leitores de JSON (`tarefasDe`, `duvidasDe`, `impactosDe`, `decisoesDe`) e constantes de arquivo → `componentes/` e `refinamento/locais.js`; `notificar`/`notifsDe` → `notificacoes.js` | baixo | 25 min | testes + tsc |
| 2 | Contrato `ctx` | criar `ctx` (`render`, `ticketAberto`, `pasta`, `pastaAba`, `gravar`, `notificar`, `abrirAba`, `pedirSecao`, `secrets`, `globalState`) e o registro: `acoes = { ...conf.acoes, ...modulo.acoes(ctx) }`. Migrar só as 4 ações do rodapé (`notifLidas`, `cmdsAlternar`, `cmdAlternar`, `emuAlternar`) | médio | 30 min | `teste-acoes.js` + abrir a extensão e clicar no rodapé |
| 3 | QA inteiro (piloto) | `qa/acoes.js` (`qaPlay`…`qaParar`, `depsQa`), ▶ do cabeçalho, `caixaAmb` do rodapé, aba Massa, `ABAS.qa` | médio | 1 h | `teste-qa.js` + rodar um QA no emulador |
| 4 | Lista de tickets | `carregarMeus`, `meu*`, `previa*`, `listaModo`, `labelQA`, `telaPrevia`, `VINCULADOS` → controlador da lista | médio | 45 min | abrir lista nos 3 módulos, filtrar, puxar, remover |
| 5 | Docs, notas e conversas | `docAbrir`, `docMencionar`, `handoff*`, `anexoBaixar/Todos` → `aba-docs`; `daNota` → `notas.js`; `reconciliar` e afins → `conversas.js` | baixo-médio | 45 min | baixar anexo, salvar nota, abrir conversa de ticket |
| 6 | **Orquestrador** | `etapa`, `FERRAMENTAS`, `bancoEnv`, `reposDe`, `depoisDaEtapa`, `avisarImpactos`, `filaTriagem`, `filaImpactos`, `filaTarefas`, `seguir`, `vigiarComentarios`, `qaCaminhos`, `pedido`, `respondidas`, `alterando` → `refinamento/orquestrador.js` (ou dentro de `maestro.js`); entra no `ctx` como `ctx.orq` | **alto** | 1,5 h | refinar um ticket de ponta a ponta; comentário novo no Jira |
| 7 | Refinamento: Dúvidas | aba Dúvidas, `duvida*`, `fecharDuvida`, `escolherMencoes`, CSS `.duvida` | médio | 40 min | tirar dúvida, enviar ao Jira, confirmar resposta |
| 8 | Refinamento: Mudanças | `caixaDecisao`, `caixaMudancas`, `mudancaDecidir`, `mudancaDesfazer`, `impactoCiente`, CSS `.mud*`/`.dec*` | médio | 40 min | `teste-mudancas.js`. **Resolver aqui o `.decisao` duplicado** |
| 9 | Refinamento: Tarefas | `telaTarefas`, modal (script), `tarefa*`, `qaAprovar`, `revisao*`, CSS `.t*` | médio-alto | 1 h | aprovar, reprovar e pedir alteração de um card |
| 10 | Refinamento: Spec | `telaConstituicao`, `cartaoAgora`, pilha de perguntas (script), `spec*`, `responder`, `refinar/retomar/pausar`, `botaoRefino`/`pillRefino`, aba Análise, CSS `.passo*`/`.pilha*` | alto | 1,5 h | passar pelos passos 0-6 de uma spec |
| 11 | Encolher o núcleo | `render()` só monta e roteia (dados da aba vêm de cada módulo); `ABAS` por módulo; `cabecalho`/`rodape` pedem pedaços ao módulo ativo; `CSS_MOLDURA` separado | médio | 1 h | tudo acima + `npm run tipos` |
| 12 | Limpeza | CSS duplicado (`html/body/.rolagem`), `.rodape` morto, `_teste` enxuto, README | baixo | 20 min | testes + tsc |

Total aproximado: 10 a 11 horas. Estado final do `painel.js`: ~250 linhas (moldura, `render`, roteamento).

## Regras de cada etapa

1. Antes: rodar testes e `npm run tipos`; depois: rodar de novo. Falha = não commita.
2. Mover sem reescrever. Se aparecer vontade de melhorar o código movido, anotar e fazer em outra etapa.
3. Etapas 3, 6, 9 e 10 pedem teste manual na extensão (não há teste automático da tela).
4. Se uma etapa passar de 1,5x o tempo estimado, parar e reavaliar o corte.

## Resultado

`extensao/painel.js` foi de 1.945 linhas para **224** (só estado, `render` e roteamento; moldura em `moldura.js`).

| Etapa | Commit |
|---|---|
| 0 Rede de segurança | 82d551c |
| 1 Base compartilhada | 48cd3d7 |
| 2 Contrato `servicos`/`acoes` | 1d405ed |
| 3 QA | 748023c |
| 4 Lista de tickets | 4e23d7a |
| 5 Docs, notas, conversas | 105f384 |
| 6 Orquestrador | c1eb2a9 |
| 7 Dúvidas | 8a827da |
| 8 Mudanças | f30f7e4 |
| 9 Tarefas | 45aed72 |
| 10 Spec | 3a7ff0e |
| 11 Moldura | a88cb5f |
| 12 Limpeza | esta |

### Conferência manual pendente (abrir a extensão)

Não há teste automático da tela; fica por conta de quem abrir o VS Code.

**Rodapé e cabeçalho**
1. Rodapé: abrir o sino (some o contador), abrir Comandos, ligar/desligar um comando e um emulador.
2. Cabeçalho do ticket: botões Claude, Jira e Atualizar, status no board, menu de abas nas 3 listas.

**Lista**
3. Abrir a lista nos 3 módulos, filtrar, puxar e remover um vinculado.

**Docs, notas e conversas**
4. Baixar um anexo, salvar uma nota, abrir a conversa de um ticket.

**QA**
5. Rodar um QA no emulador (▶, pausar, retomar) e ver o ambiente no rodapé.

**Refinamento**
6. Aba Spec: passar pelos passos 0-6 de uma spec (cartão Agora, pilha de perguntas, Dar início, pausar, retomar).
7. Aba Dúvidas: tirar uma dúvida, enviar ao Jira, confirmar a resposta.
8. Comentário novo no Jira: caixa de mudança, decidir, desfazer (conferir que a caixa vermelha não vaza para Decisões e Dúvidas).
9. Aba Tarefas: aprovar, reprovar e pedir alteração de um card; modal.
10. Refinar um ticket de ponta a ponta (Maestro: etapa, filas, seguir).

**Geral**
11. Aba Decisões e aba Análise (handoff backend/mobile) renderizando; Sem ticket.
12. Tipos: `npm run tipos` não roda neste ambiente (falta `npm install` em `extensao/`, o `tsc` não está instalado). Com o `tsc` instalado, o esperado é só o erro TS2688 do `vscode` (falta `@types/vscode`), igual ao estado antes do desacoplamento.
