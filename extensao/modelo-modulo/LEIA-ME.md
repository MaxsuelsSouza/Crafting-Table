# Modelo de módulo

Copie `modulo.js` para `extensao/<modulo>/<modulo>.js` e registre nos pontos abaixo. O padrão visual está em `CLAUDE.md` (seção "Padrão de módulo").

Pasta do módulo (`CLAUDE.md`, "Pasta do módulo"): `<modulo>.js` (registro) · `orquestrador/` (um arquivo por regra) · `estado.js` · `etapas/` (`index.js` + `01-….js` por etapa; etapa grande vira pasta `NN-nome/` com `subetapas/` e `regras/`) · `abas/` · `bin/` · `testes/`. Exemplos prontos: `extensao/incidentes/`, `extensao/refinamento/`, `extensao/qa/` e `extensao/implementacoes/`. Arquivos pequenos, um por regra (`CLAUDE.md`, "Arquivos pequenos").

## Registro (nesta ordem)

| # | Arquivo | O que acrescentar |
|---|---|---|
| 1 | `componentes/menu-modulos.js` | `[mod.ID, mod.ROTULO, mod.DICA]` em `MODULOS` |
| 2 | `infra/tickets.js` | `mod.ID` em `SUBPASTAS` (pasta `<ticket>/<id>/` da aba) |
| 3 | `painel/lista.js` | `[mod.ID]: mod.VINCULADOS` em `VINCULADOS` (filtro especial na busca: `carregarMeus`) |
| 4 | `painel/moldura.js` | `ABAS[mod.ID] = mod.ABAS` e um ramo `sessao.focoLista() === mod.ID ? mod.botaoPlay(...)` no `cabecalho` |
| 5 | `painel/painel.js` | `if (aba === 'central') ...` por módulo em `corpoAba` e `mod` em `modulosAcoes` |
| 6 | `modulos/conversas.js` | `[mod.ID]: mod.ETAPA` no mapa de etapas (3 pontos: título, pedido e histórico) |

## Ganchos opcionais do registro

Só quando o módulo precisa; o ponto comum chama o gancho do registro, sem `if` com a regra do módulo. Exemplo de quase todos: `extensao/refinamento/refinamento.js` (lógica em `refinamento/ganchos-painel.js`); `rodape`, `evidencias` e `ETAPA_PEDIDO`: `extensao/qa/qa.js`.

| Gancho | Quem chama | Para quê |
|---|---|---|
| `corpoAba(aba, t, d, dir)` | `painel.js` (`corpoAba`) | corpo das abas próprias; `undefined` = a aba não é do módulo |
| `dadosAba(t, dir)` | `painel.js` (`render`) | campos que as abas próprias leem, somados ao `d` |
| `antesDaAba(aba, t)` · `aoDesenhar(t)` | `painel.js` (`render`) | conferir arquivos antes de desenhar; ajustar o ticket ao desenhar |
| `observar(t, depois, obs)` | `painel.js` (`render`) | pastas de fora do ticket que redesenham a tela |
| `botaoPlay(dir, b, t)` · `pill(t)` · `faixa(t)` · `contadorAba(id, t)` | `moldura.js` (`cabecalho`) | ▶/⏸, pill, faixa sob o cabeçalho e o número nas abas |
| `CSS()` · `script()` | `moldura.js` | CSS e script da webview (um bloco cada) |
| `situacao(t)` | `infra/situacao.js` | pill do card na lista |
| `pedidoConversa(s, t)` | `modulos/conversas.js` | texto do pedido da conversa aberta pelo ✦ |
| `ETAPA_PEDIDO` | `modulos/conversas.js` | o nome do módulo no pedido, quando difere do `ETAPA` do título (QA: `QA (testes)`) |
| `rodape(dir, acao)` | `componentes/rodape.js` | caixa do módulo depois de Comandos (QA: Ambiente) |
| `evidencias: { VIGIAR, corpo(dir, uri), arquivos(dir) }` | `modulos/evidencias.js` | bloco do módulo no topo da seção Evidências: arquivos da pasta que redesenham, o corpo e as evidências que entram na grade (QA) |
| `VINCULADOS.seletor: 'label'` | `painel/lista.js` · `componentes/vinculados.js` | a caixa de vinculados busca pela label escolhida no seletor, não pela etapa (QA) |
| `iniciar(servicos, ctx)` · `aoAtualizar()` · `orq()` | `painel.js` | ligar relógios ao abrir o painel, o ⟳ e o `servicos.orq` |

## Conferência

- Lista: pesquisa, ↑↓ e ＋ Ticket na mesma barra; contador de tickets acima do botão; card "Sem ticket" por último; caixa Vinculados só com a ferramenta cadastrada.
- Ticket: ← · título · ✦ conversa · ⚡ · 🎫 · 🗑; pill de status e ⟳; botões vêm de `componentes/botoes-ticket.js`; menu `Docs · Central · Ticket · Decisões | Conversas`; Central (nome livre) só com Ao vivo.
- Rodapé: 🔔 e ▶ Comandos (nada a fazer: vem da moldura).
- Testes: copie um `teste-*.js` do módulo mais próximo (`incidentes/testes/` é o menor).
