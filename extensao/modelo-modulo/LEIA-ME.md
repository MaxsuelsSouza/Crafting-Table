# Modelo de módulo

Copie `modulo.js` para `extensao/<modulo>/<modulo>.js` e registre nos pontos abaixo. O padrão visual está em `CLAUDE.md` (seção "Padrão de módulo").

Pasta do módulo (`CLAUDE.md`, "Pasta do módulo"): `<modulo>.js` (registro) · `orquestrador/` (um arquivo por regra) · `estado.js` · `etapas/` (`index.js` + `01-….js` por etapa; etapa grande vira pasta `NN-nome/` com `subetapas/` e `regras/`) · `abas/` · `bin/` · `testes/`. Exemplo pronto: `extensao/incidentes/`. Arquivos pequenos, um por regra (`CLAUDE.md`, "Arquivos pequenos").

## Registro (nesta ordem)

| # | Arquivo | O que acrescentar |
|---|---|---|
| 1 | `componentes/menu-modulos.js` | `[mod.ID, mod.ROTULO, mod.DICA]` em `MODULOS` |
| 2 | `infra/tickets.js` | `mod.ID` em `SUBPASTAS` (pasta `<ticket>/<id>/` da aba) |
| 3 | `painel/lista.js` | `[mod.ID]: mod.VINCULADOS` em `VINCULADOS` (filtro especial na busca: `carregarMeus`) |
| 4 | `painel/moldura.js` | `ABAS[mod.ID] = mod.ABAS` e um ramo `sessao.focoLista() === mod.ID ? mod.botaoPlay(...)` no `cabecalho` |
| 5 | `painel/painel.js` | `if (aba === 'central') ...` por módulo em `corpoAba` e `mod` em `modulosAcoes` |
| 6 | `modulos/conversas.js` | `[mod.ID]: mod.ETAPA` no mapa de etapas (3 pontos: título, pedido e histórico) |

## Conferência

- Lista: pesquisa, ↑↓ e ＋ Ticket na mesma barra; contador de tickets acima do botão; card "Sem ticket" por último; caixa Vinculados só com a ferramenta cadastrada.
- Ticket: ← · título · ✦ conversa · ⚡ · 🎫 · 🗑; pill de status e ⟳; botões vêm de `componentes/botoes-ticket.js`; menu `Docs · Central · Ticket · Decisões | Conversas`; Central (nome livre) só com Ao vivo.
- Rodapé: 🔔 e ▶ Comandos (nada a fazer: vem da moldura).
- Testes: copie um `teste-*.js` do módulo mais próximo (`incidentes/testes/` é o menor).
