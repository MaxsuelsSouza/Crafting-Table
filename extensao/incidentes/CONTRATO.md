# Contrato dos artefatos do Mergulho (Incidente)

Pasta da aba: `~/.claude/tickets/<CHAVE>/incidentes/`. A extensão apaga o arquivo da etapa antes de rodar e confere, depois, que ele existe e não está vazio.
Quem grava: o Claude só por `bin/mergulho-gravar` (nomes permitidos) e `bin/mergulho-fluxo`; o resto é da extensão. Lógica de cada etapa: `etapas/NN-*.js`.

| Arquivo | Quem grava | Para quê |
|---|---|---|
| `entrada.json` / `entrada.md` | extensão (`entrada.js`, início da etapa 1) | relato, evidências e ambiente com a confiança de cada fonte (aprovado, gerado, bruto, verbal, ausente); `modo` investigar/perguntar; `exigeAprovacaoInicial` |
| `.jira-contexto.md` | extensão | descrição, subtarefas, comentários (e o documento) em texto |
| `1-triagem.md` … `4-diagnostico.md` | Claude | uma por etapa; terminam com "Origem das afirmações" e "Lacunas" (pedido no prompt) |
| `massa-real.sql` | Claude (etapa 3) | a prova; sem ela a etapa 3 deve registrar "Pendência: massa real" em `3-dados-logs.md` ou a extensão pausa (`massa`) |
| `fluxo.json` | Claude via `mergulho-fluxo` | passos da reprodução (P01…) com execuções e evidências |
| `massa-teste.sql` | Claude (5.2) | só INSERT de linhas novas; UPDATE/DELETE exigem WHERE e nenhum comando pode citar chave da massa real |
| `.massa-aprovada` | extensão | hash do `massa-teste.sql` aprovado pelo dev; sem ele nada é executado no banco |
| `.massa-teste.ok`, `.ambiente.ok` | extensão | marcam 5.2 executada e 5.3 pronta |
| `.reproducao-claude.json` | Claude (5.4) | resultado declarado: `{ ok, acao, prints[] }` |
| `reproducao.json` | extensão | `{ ok, acao, quando, midias[] }`; "Aceito pelo dev sem resultado" quando o Claude não registrou |
| `resumo.md` | Claude (6) | com aviso no topo quando foi montado pela extensão sem IA |
| `.mergulho.json` | extensão | etapa, fase, pausa, aprovacao (`arq` quando é o portão da massa), obsPO, sub, host |
| `.pausa.json`, `.respostas.md` | Claude / extensão | pausa estruturada e respostas do dev |

Portões de aprovação: etapas 1 a 3 só quando a entrada tem lacuna (`exigeAprovacaoInicial`); a 4 sempre; e a massa de teste (5.2) sempre, antes de executar no banco.
