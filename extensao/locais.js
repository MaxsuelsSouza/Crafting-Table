// @ts-check
const fs = require('fs');
const path = require('path');
const tickets = require('./tickets');

// FONTE ÚNICA de "onde cada coisa mora". Mudou um local? Muda só aqui (painel, prompts e abas leem daqui).
//
// PASTA DO TICKET  ~/.claude/tickets/<CHAVE>/  (o Claude NÃO escreve aqui com Write: "arquivo sensível")
//   <qualquer arquivo>       aba Docs (anexos do Jira + atalhos do hook documentos.py)
//   .notas.html              aba Notas            .origem.json     de onde veio cada doc baixado
//   .tarefas.json            aba Tarefas          .duvidas.json    aba Dúvidas
//   .decisoes.json           aba Decisões         .impactos.json   vigia de comentários
//   evidencias/              aba Evidências       aprovados/       cópia de cada passo aprovado
//   .ao-vivo.jsonl           caixa "Ao vivo"      .notificacoes.*  sino
// PASTA DA SPEC    <repo de specs>/<spec.dir>/    (versionada; o Claude escreve aqui)
//   spec.md plan.md tasks.md analise.md testes.md + qualquer outro .md  → aba Docs
//   mapa-backend.md, mapa-mobile.md                                    → aba Análise (NÃO aparecem em Docs)
//   sdd-state.json           estado do SDD (só o sdd-state altera)
// RAIZ DO REPO DE SPECS    <repo>/constitution.md  (passo 0)             → aba Docs
const NOMES = {
  notas: '.notas.html', origem: '.origem.json', tarefas: '.tarefas.json', duvidas: '.duvidas.json',
  impactos: '.impactos.json', decisoes: '.decisoes.json',
};
const HANDOFF = { backend: 'mapa-backend.md', mobile: 'mapa-mobile.md' };
const HANDOFF_LEGADO = { backend: '.handoff-backend.md', mobile: '.handoff-mobile.md' }; // antes: pasta do ticket
const PASSOS = { 1: 'spec.md', 2: 'spec.md', 3: 'plan.md', 4: 'tasks.md', 5: 'analise.md', 6: 'testes.md' };

const pasta = (id) => tickets.pasta(id);
const dirSpec = (r) => (r.spec?.repo && r.spec?.dir ? path.join(r.spec.repo, r.spec.dir) : null);
const arquivoPasso = (r, n) => (n === 0 ? path.join(r.spec.repo, 'constitution.md') : path.join(dirSpec(r), PASSOS[n]));
// Análise de uma camada: a da spec; se ainda não existe e há uma antiga na pasta do ticket, usa a antiga.
function arqHandoff(r, lado) {
  const novo = dirSpec(r) && path.join(dirSpec(r), HANDOFF[lado]);
  const legado = path.join(pasta(r.id || r.chave), HANDOFF_LEGADO[lado]);
  return novo && (fs.existsSync(novo) || !fs.existsSync(legado)) ? novo : legado;
}

const EXCLUIDOS_DOCS = new Set(Object.values(HANDOFF));
// Arquivos de spec que a aba Docs mostra: constitution.md + todo .md da pasta da spec, menos os da aba Análise.
function docsDaSpec(r) {
  if (!r.spec?.repo) return [];
  const arqs = [path.join(r.spec.repo, 'constitution.md')];
  try { for (const n of fs.readdirSync(dirSpec(r))) if (/\.md$/i.test(n) && !n.startsWith('.') && !EXCLUIDOS_DOCS.has(n)) arqs.push(path.join(dirSpec(r), n)); } catch { /* spec ainda não criada */ }
  return arqs.flatMap((full) => { try { return [{ nome: path.basename(full), full, atalho: false, origem: full, mtime: fs.statSync(full).mtimeMs }]; } catch { return []; } });
}

// Frase que o maestro manda ao Claude dizendo onde gravar.
const ondeSalvar = (r) => (dirSpec(r)
  ? `\nPasta da spec (grave aqui spec, plano, testes e qualquer documento para o usuário; as análises vão em ${HANDOFF.backend}/${HANDOFF.mobile}, que aparecem na aba Análise; ~/.claude é bloqueada para escrita): ${dirSpec(r)}`
  : '');

module.exports = { NOMES, HANDOFF, HANDOFF_LEGADO, pasta, dirSpec, arquivoPasso, arqHandoff, docsDaSpec, ondeSalvar };
