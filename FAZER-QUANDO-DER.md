# Fazer quando der

O que foi conversado e **ainda não foi mandado fazer**. Nada aqui mudou o comportamento atual.

| Item | O que é | Estado hoje |
|---|---|---|
| Migrar os módulos existentes | Refinamento, Implementações, QA e Incidentes passarem para `Docs · Central · Ticket · Decisões \| Conversas` e para a aba Central com o Ao vivo (`componentes/aba-central.js`) | Não migrado. Cada módulo mantém as abas dele |
| Trocar o cabeçalho pelo componente | `painel/moldura.js` (`cabecalho()`) passar a usar `componentes/cabecalho-ticket.js` | Componente criado, **sem uso**. A moldura continua montando o `<header>`; só os botões já vêm de `botoes-ticket.js` |
| Registro único de módulo | Hoje são 6 pontos (`menu-modulos`, `tickets`, `lista`, `moldura`, `painel`, `conversas`); a ideia é registrar em um só | Não feito. Checklist em `extensao/modelo-modulo/LEIA-ME.md` |
| Unificar ícones duplicados | `IC.lixo` x `LIXO` (`card-ticket.js`), `IC.atualizar` x `ATUALIZAR` (`vinculados.js`) | Duplicados |
| Unificar a pill de tipo do ticket | `card-ticket.js` (`tipoPill`) e `moldura.js` (IIFE do cabeçalho) | Duplicada, com versões diferentes |
| Ao vivo montado por módulo | `spec.js`, `esteira.js`, `mergulho.js`, `qa.js` montam a caixa e o fallback cada um; CSS/script também em `qa.js` e `evidencias.js` | Duplicado |
| Cabeçalho da prévia de vinculado | `lista.js` (`telaPrevia`) tem o próprio `<header>` com ← e 🎫 | Fora do componente de botões |

Itens do **plano de ajuste** (✦ fixo e tooltip genérico, menu com Decisões, ▶/⏸ no componente de botões): `plano-ajuste-padrao-modulo.md` na pasta de documentos da conversa.
Contador de tickets: fica como está (na linha do menu de módulos).
