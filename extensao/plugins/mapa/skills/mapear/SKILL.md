---
name: mapear
description: Mapeamento do código que abre o passo 3 (Planejamento técnico) do SDD no modo refinamento da Crafting Table. Decide as camadas (backend, mobile ou ambas) a partir da spec, escolhe a ref de leitura (construção × código vivo), lê o código de verdade e grava uma análise por camada (mapa-backend.md / mapa-mobile.md na pasta da spec, aba Análise) com inventário invertido por RF, escada de mudança, chamadores, regras de verificação e evidência conferida. Use quando a mensagem do maestro pedir o mapeamento do passo 3.
---

# Mapeamento do código — passo 3 do SDD

Você está no **início do passo 3**: antes de escrever `plan.md`, descubra **o que já existe** e **onde a spec
toca o código**. O plano que nasce daqui cita arquivos reais em vez de inventar módulos, tabelas e endpoints.

O que a mensagem do maestro te dá: pasta do ticket, **pasta da spec** (onde você grava), repositório de specs (`spec.md` v2.0 aprovada),
raízes dos repositórios (`backend: …`, `mobile: …`) e o caminho deste plugin (`mapa-git`, `mapa-conferir`).

## Regras (valem do começo ao fim)

1. **Não infira: leia.** Use Glob/Grep/Read no repositório. Toda afirmação técnica (enum, status, coluna,
   rota, contrato, comportamento) leva **evidência** `caminho/relativo/Arquivo.ext:linha` entre crases, ou a
   consulta de banco que a provaria. Spec, card e documento dizem a **intenção**; o código diz o que **existe**.
2. **Git só pelo `mapa-git`** (só leitura): `mapa-git <repo> log --oneline -20 <ref> -- <caminho>`,
   `mapa-git <repo> show <ref>:<caminho>`, `mapa-git <repo> grep -n <termo> <ref>`, `mapa-git <repo> branch -r --list '*release*'`.
3. **Não mexa em código** e não crie branch: este passo só lê. Escreve apenas as análises por camada (e depois o plano), **sempre na pasta da spec**: a pasta `~/.claude` (onde fica o ticket) é bloqueada para gravação.
4. Dúvida que o código não responde (ref de leitura, camada, regra) → `sdd-state pergunta add … --opcoes`
   e **termine a execução**; não chute.
5. **Narre** uma frase curta antes de cada bloco ("Vou procurar onde o fluxo de devolução vive no backend.").

## 1. Camadas — backend, mobile ou as duas?

Leia `spec.md` (RFs, histórias, casos de borda) e classifique **cada RF**:
- **mobile** quando há interação do operador no coletor (tela, leitura, feedback, navegação);
- **backend** quando há regra, persistência, integração, consulta, job ou permissão;
- quase sempre os dois: tela nova consome endpoint novo/alterado.

Registre a tabela `RF | camadas | por quê`. Camada sem nenhum RF não ganha handoff. Frontend web está fora
por padrão: se algum RF exigir tela web, registre como pergunta.

## 2. Ref de leitura — construção ou código vivo?

O fluxo já roda em produção? Procure o domínio na linha de release:
`mapa-git <repo> branch -r --list '*master*'` e `mapa-git <repo> log --oneline -15 <ref> -- <caminho do domínio>`.
- **Construção** (domínio novo ou ainda não entregue): leia o working tree / branch atual.
- **Código vivo** (há commits do domínio na linha de release, ex. `origin/master-md`): leia **pela ref de
  release** (`show`/`grep` com a ref), não pelo working tree nem pela `feature/*` — ela costuma estar defasada.

Registre: **ref de leitura**, **ref de destino** (de onde a branch de trabalho vai sair) e se divergem.

## 3. Reconhecimento raso (minutos, não dezenas de chamadas)

Onde o fluxo vive no backend (namespace/pasta) · qual módulo do mobile (`src/<módulo>/`, descubra com Glob
— não use lista fixa) · quantos endpoints/handlers · **histórico da área** (`log` dos caminhos: o que cada
correção recente consertou e por quê; nunca reintroduza o que foi removido de propósito).
Saída: um parágrafo — "vive em X, módulo Y, N correções recentes (a última corrigiu Z)".

## 4. Leitura por camada

**Backend** (`novo-wms-backend`, .NET, Clean Architecture, CQRS/MediatR, Oracle/EF Core) — leia o `Claude.md` do repo:
- Domínio: `FCxLabs.WMS.Domain/Entities`, `DomainServices`, `Enums`, `Constants`.
- Repositórios: `Domain/Interfaces/Repositories`, `Infrastructure/Persistence/Repositories` e `Mappings`.
- CQRS: `FCxLabs.WMS.Application/Features/**` (commands, queries, handlers, validators).
- API: `FCxLabs.WMS.Api/Controllers/**` — versão (o mobile usa **V2**; V3 só sem quebrar a V2).
- Testes: `FCxLabs.WMS.Tests.Common/Builders`, `Mocks` (o que reaproveitar).
- Jobs/workers: `FCxLabs.WMS.Job`, `FCxLabs.WMS.Worker` se o fluxo tiver processamento assíncrono.

**Mobile** (`wms-mobile`, React Native) — leia o `CLAUDE.md` do repo e siga a skill `analyze-module` dele se estiver disponível:
- Módulo: `src/<módulo>/` (descubra; procure o termo do domínio antes de concluir que não existe).
- `interfaces`/`types`, hooks de request (`core/hooks`, `<módulo>/hooks/requests`), `screens`, `components`
  (e os do `core/components` reaproveitáveis), `navigators`, `providers`, feature flags (`core/enums/FeatureFlagsEnum.ts`).

**Banco** (opcional; só leitura). Rode `mapa-db status`: se disser que o banco **não está configurado**, não consulte nada:
liste as consultas que deveriam rodar como pendência (🟡) e siga. Se estiver configurado:
- **Só o `mapa-db`** (`mapa-db consulta "<select>"` ou `mapa-db lote <arquivo.sql>`). Nunca use o MCP do Oracle nem o SQLcl direto.
  Prefira o **lote** (uma sessão para várias consultas: o SQLcl demora a subir). Só SELECT/WITH; até 50 linhas por consulta;
  colunas de dados pessoais voltam como `***` (não tente contornar).
- **Estrutura primeiro** (catálogo): `all_tab_columns`, `all_constraints`/`all_cons_columns`, `all_indexes`, `all_triggers`,
  `all_sequences` para as tabelas que a spec toca (descubra-as nos Mappings do EF, em `Infrastructure/Persistence/Mappings`).
  Compare coluna a coluna com o EF e registre a **divergência** (coluna que falta, que sobra, tipo ou nulidade diferente).
- **Depois as premissas de dado**, uma consulta por premissa, sempre **agregada** (`COUNT`, `GROUP BY`, `HAVING COUNT(*) > 1`
  para cardinalidade). Contagem baixa não é conclusão de negócio se a base for o QAS: diga em que base mediu.
- **Massa para o teste do passo 6:** liste IDs (até 20) de registros que já cobrem o cenário.
- Cada resultado leva o **marcador do cabeçalho**, ex. `[db:a1b2c3d4]`, ao lado da afirmação: o `mapa-conferir` só aceita o
  marcador se a consulta rodou de verdade. Sem marcador, a premissa continua 🟡.
- Erro de consulta: corrija e rode de novo; erro de conexão ou "somente leitura": pare, registre como pendência e siga.
- DDL continua só como texto no plano (Oracle). O script nunca executa nada que escreva.

## 5. Inventário invertido por RF (o coração do handoff)

Uma linha por comportamento tocado:

| RF | Hoje (evidência) | Desejado (critério de aceite) | Menor mudança (escada) | Quem mais passa aqui |
|---|---|---|---|---|

- **Escada de mudança** (pare no primeiro degrau que resolve): (1) precisa existir? → (2) **já existe no
  código?** reaproveite e cite → (3) estender o que existe → (4) só então criar o mínimo. Diga o degrau.
- **Quem mais passa aqui**: os outros chamadores do método/handler/componente que vai mudar, **nomeados**
  (`grep`). Três chamadores = três deltas, não um.
- Bug/melhoria sobre código vivo: declare **causa raiz × sintoma** com evidência e se a entrega corrige a
  causa ou contém o sintoma.

## 6. Verificações obrigatórias

- **Contrato, consumidor primeiro**: para cada endpoint novo/alterado, onde o mobile consome e como parseia hoje
  (evidência). Mudança que quebra o consumidor só entra com o delta dele junto. Na dúvida, **aditivo**.
- **Alvo implícito**: como o servidor resolve cada entidade que não vem no request (registro ativo, agregado pai,
  usuário). Sem consulta que resolva → vira item do plano, não premissa.
- **Escopo**: cada regra/consulta diz se é por item, por agregado, por entidade relacionada ou por usuário.
- **Efeitos colaterais**: eventos publicados, jobs/relatórios afetados, transições de status, idempotência,
  premissas de cardinalidade — comparado com o handler equivalente que já existe.
- **Procedência**: cada "já existe" diz de onde (working tree, ref de release, branch não mergeada).

## 7. Autocrítica antes de gravar (lente ponytail)

Releia o que você propôs e corte: abstração com uma implementação, camada que só repassa, flag/config que
ninguém muda, tela/hook/handler novo quando um existente estendido resolve. Liste em **"O que não vamos
criar"** (o que cortou e o que reaproveita no lugar). Atalho consciente (ex.: consulta simples sem índice)
fica em **"Atalhos conscientes"** com o teto e quando trocar.

## 8. Gravar e conferir

Um arquivo por camada mapeada, na **pasta da spec** (a mesma de `spec.md` e `plan.md`; nunca em `~/.claude`): `mapa-backend.md` e/ou
`mapa-mobile.md` (eles aparecem na aba **Análise** e viajam com a spec para quem for implementar). Molde:

```
# Mapeamento <camada> — <CHAVE> · spec vX
Ref de leitura: … · Ref de destino: … · Construção | Código vivo
## Camadas por RF            (tabela da seção 1, só os RFs desta camada)
## Onde o fluxo vive          (reconhecimento + histórico da área)
## Inventário invertido       (tabela da seção 5)
## Contratos                  (consumidor primeiro; payload atual × proposto)
## Alvo implícito, escopo e efeitos colaterais
## Banco                      (tabelas e colunas reais, divergência EF × banco, premissas com [db:id], pendências 🟡)
## O que não vamos criar
## Atalhos conscientes
## Riscos e perguntas em aberto
```

Depois de gravar, **confira as evidências**:
`mapa-conferir <pasta da spec>/mapa-<camada>.md --repo <raiz da camada> [--ref <ref de leitura>] --db-log <pasta do ticket>/.mapa-db.jsonl` (ele confere também os marcadores `[db:…]` no log de consultas, que fica na pasta do ticket).
Toda linha `FALTA`/`LINHA` é evidência errada: corrija antes de seguir. Só então escreva o `plan.md`,
que **abre** com `## Mapeamento do código` (camadas, ref, resumo de 5 linhas e os arquivos `mapa-*.md`) e
cita `arquivo:linha` nas decisões.
