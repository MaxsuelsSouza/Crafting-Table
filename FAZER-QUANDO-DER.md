# Fazer quando der

O que foi conversado e **ainda não foi mandado fazer**. Nada aqui mudou o comportamento atual.

| Item | O que é | Estado hoje |
|---|---|---|
| Migrar os módulos existentes | Refinamento, Implementações, QA e Incidentes passarem para `Docs · Central · Ticket · Decisões \| Conversas` e para a aba Central com o Ao vivo (`componentes/aba-central.js`) | Não migrado. Cada módulo mantém as abas dele |
| Trocar o cabeçalho pelo componente | `painel/moldura.js` (`cabecalho()`) passar a usar `componentes/cabecalho-ticket.js` | Componente criado, **sem uso**. A moldura continua montando o `<header>`; só os botões já vêm de `botoes-ticket.js` |
| Registro único de módulo | Hoje são 6 pontos (`menu-modulos`, `tickets`, `lista`, `moldura`, `painel`, `conversas`); a ideia é registrar em um só | Não feito. Checklist em `extensao/modelo-modulo/LEIA-ME.md` |
| Unificar ícones duplicados | `IC.lixo` x `LIXO` (`card-ticket.js`), `IC.atualizar` x `ATUALIZAR` (`vinculados.js`) | Duplicados |
| Unificar a pill de tipo do ticket | `card-ticket.js` (`tipoPill`) e `moldura.js` (IIFE do cabeçalho) | Duplicada, com versões diferentes |
| Ao vivo montado por módulo | `refinamento/abas/spec/corpo.js`, `esteira.js`, `mergulho.js`, `qa.js` montam a caixa e o fallback cada um; CSS/script também em `qa.js` e `evidencias.js` | Duplicado |
| Organizar os outros módulos como o Incidente | Implementações e QA na estrutura da pasta `incidentes/` (registro em `<modulo>.js`, `etapas/01-….js`, `abas/`, `bin/`, `testes/`) e os pontos comuns lendo do registro | Incidentes e Refinamento organizados. Implementações e QA seguem com `if` por módulo em `painel.js`, `moldura.js`, `lista.js`, `situacao.js` |
| Régua de confiança em `infra/` | `sobreTicket`, `capacidadesDe`, `NIVEIS`, `rank`, `nivelDe` e `paraMarkdown` saírem de `implementacoes/dossie.js` para `infra/confianca.js` (o dossiê, `incidentes/entrada.js` e o Refinamento importam de lá) | Incidentes e Refinamento (`refinamento/abas/spec/acoes/iniciar.js`, `sobreTicket`: o ticket basta?) dependem de `implementacoes/dossie.js` |
| Ao vivo sem nome de aba fixo | `componentes/ao-vivo.js` (linha ~205) tem `['qa', 'spec', 'mergulho', 'esteira']` fixo; passar a vir do registro de cada módulo | Componente comum conhece abas dos módulos |
| Aba Mergulho como Central | O Incidente usa as abas `mergulho` e `evidenciasInc` (ids próprios, também em `componentes/ao-vivo.js`); o padrão é a vaga `central` | Não migrado (ids mantidos na organização) |
| Aba Spec como Central | O Refinamento usa as abas `spec`, `analise`, `tarefas` e `duvidas` (ids próprios; `spec` também em `componentes/ao-vivo.js`); o padrão é a vaga `central` | Não migrado (ids mantidos na organização) |
| Registro de configuração | Trazer para `refinamento/` o que é só dele na tela de configurações e nas tabelas comuns: `sddState`, `SPECS_PADRAO`, cards de specs, modelo e esforço, checagem do plugin sdd e ordem de `tiposQuebrar` (`configuracao/configuracao.js`); tipos do Refinamento em `configuracao/conexao.js`; `tiposQuebrar/Desenvolver/Executar` (`provedores/variaveis.js`); card "Mudança pedida" (`integracoes/teams.js`); vocabulário do SDD (`painel/maestro.js`: `PASSOS`, `SDD`, `fraseSdd`); settings `specsDir`, `specsRemoto`, modelo, esforço e `repositorios` (`package.json`); `plugins/foco/` (só o Refinamento usa) | Fora da pasta: precisa de um gancho de configuração no registro, que não existe |
| Restos do Refinamento no painel comum | `lado` (Backend/Mobile da aba Análise) é estado do `painel.js`, com a ação `lado`; CSS `.ct-roxo` da faixa no `CSS_MOLDURA`; `painel/lista.js` decide o seletor de etapa dos vinculados (`fixo = k !== tickets.REFINAMENTO`) e o card roxo (`refinando`); `painel/documento.js` chama `s.orq?.vigiarComentarios` | Ficaram no painel na organização (sem mudar comportamento) |
| Cabeçalho da prévia de vinculado | `lista.js` (`telaPrevia`) tem o próprio `<header>` com ← e 🎫 | Fora do componente de botões |

Itens do **plano de ajuste** (✦ fixo e tooltip genérico, menu com Decisões, ▶/⏸ no componente de botões): `plano-ajuste-padrao-modulo.md` na pasta de documentos da conversa.
Contador de tickets: fica como está (na linha do menu de módulos).
