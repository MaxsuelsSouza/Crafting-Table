# Crafting Table

Extensão do VS Code ao lado do Claude Code, com o ticket no centro. Código em `extensao/`; visão geral em `README.md`.

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

Em todas as telas do ticket: 🔔 **Notificações** e ▶ **Comandos**. Não é por módulo.

### Vigia (global, `extensao/painel/vigia.js`)

Observador de toda execução em segundo plano (`maestro.rodar`); módulo novo não precisa fazer nada.
- Mais de 2 min só lendo/buscando, sem gravar nem executar: abre uma caixa com o que está acontecendo, 3 opções e "Outra resposta…"; a escolha vira instrução para o Claude.
- Mais de 3 cliques no ▶ em 1 min sem o Ao vivo andar: caixa de "parece travado" (esperar, seguir de onde parou, parar).
- O ▶ do módulo precisa passar por `aoVivo.controle` (é onde o vigia aprende o nome da ação).

### Regras

- Peça nova que se repete em 2+ módulos vira componente em `componentes/` (cabeçalho do arquivo: o que é, onde é usado, como usar), nunca cópia.
- Registro do módulo nos 6 pontos comuns: ver `extensao/modelo-modulo/LEIA-ME.md`.
- O que ficou para depois (migração, registro único, troca do cabeçalho…): `FAZER-QUANDO-DER.md`.
- Atualizou o padrão aqui? Atualize também `extensao/modelo-modulo/`, `README.md` e `extensao/README.md`.
