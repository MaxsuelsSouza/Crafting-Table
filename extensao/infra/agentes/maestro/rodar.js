// @ts-check
// Roda uma etapa em segundo plano (claude -p, stream-json) e grava o que ele faz no Ao vivo; parar mata a execução da pasta.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const vigia = require('../vigia'); // observador global: busca longa e ▶ repetido
const { anotar, anexarConversa } = require('../../../componentes/ao-vivo'); // caixa "Ao vivo": o que o claude -p faz vai para lá
const { SID, PID, rodando, erros, ultimas, reiniciando, vivo, pidDe, rodandoEm, claudeBin } = require('./estado');
const { curto, linhaFerramenta } = require('./textos');
const { PEDIDO_DECISAO } = require('./decisoes');
const { linhas } = require('./linhas');

// Git só de leitura liberado em toda execução com lista de ferramentas (todos os módulos); as formas `git -C <repo> ...` também, que é como o Claude chama.
// fetch entra porque conferir origin/<branch> exige atualizar as referências remotas (não toca em branch nem arquivo).
const GIT_LEITURA = ['status', 'log', 'diff', 'show', 'branch', 'fetch', 'rev-parse', 'rev-list', 'ls-remote', 'for-each-ref', 'merge-base', 'cherry', 'describe', 'blame', 'ls-files', 'cat-file', 'name-rev']
  .flatMap((c) => [`Bash(git ${c}:*)`, `Bash(git -C * ${c}:*)`]);

// Roda uma etapa. ferramentas: lista do --allowedTools. continuar: retoma a última sessão do ticket; sessao: retoma esta sessão (id) em vez da última.
// extras: argumentos a mais do claude (ex.: --plugin-dir, --add-dir).
function rodar(dir, opcoes) {
  const { prompt, titulo = 'Claude trabalhando', cwd = dir, ferramentas = [], proibidas = [], extras = [], env = /** @type {Record<string, string>} */ ({}), continuar = false, sessao = null, aoMudar = () => {} } = opcoes;
  if (rodandoEm(dir)) return false;
  ultimas.set(dir, opcoes); erros.delete(dir);
  const gravar = (l) => anotar(dir, l);
  let sid = null, anterior = null;
  try { anterior = fs.readFileSync(path.join(dir, SID), 'utf8').trim() || null; } catch {}
  if (anterior) anexarConversa(dir, anterior); // a sessão que terminou antes desta vai para a aba Conversas (idempotente)
  if (continuar) sid = anterior;
  if (sessao) sid = sessao;
  let sessaoId = null; // desta execução
  const args = ['-p', prompt + PEDIDO_DECISAO, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    ...(ferramentas.length ? ['--allowedTools', ...new Set([...ferramentas, ...GIT_LEITURA])] : []), ...(proibidas.length ? ['--disallowedTools', ...proibidas] : []), ...extras, ...(sid ? ['--resume', sid] : [])];
  const p = spawn(claudeBin(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  rodando.set(dir, p);
  vigia.iniciar(dir);
  try { fs.writeFileSync(path.join(dir, PID), String(p.pid)); } catch {}
  gravar({ tipo: 'etapa', texto: titulo });
  aoMudar();
  let resto = '';
  p.stdout.on('data', (b) => {
    p.viuSaida = true; // o claude já falou (init): o ⚡ confere isto para detectar partida travada
    const partes = (resto + b).split('\n');
    resto = partes.pop();
    for (const l of partes) {
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.type === 'system' && e.subtype === 'init' && e.session_id) { sessaoId = e.session_id; fs.writeFileSync(path.join(dir, SID), e.session_id); }
      if (e.type === 'assistant') for (const c of e.message?.content || []) {
        if (c.type === 'tool_use') vigia.atividade(dir, c.name, linhaFerramenta(c)?.texto || c.name);
        else if (c.type === 'text' && c.text.trim()) vigia.progresso(dir);
      }
      if (e.type === 'result' && e.is_error) erros.set(dir, String(e.result || e.subtype || 'erro').slice(0, 300));
      linhas(e).forEach(gravar);
    }
  });
  let erro = '';
  p.stderr.on('data', (b) => { erro += b; });
  let falhou = false;
  const soltar = () => { rodando.delete(dir); vigia.encerrar(dir); if (pidDe(dir) === p.pid) fs.rmSync(path.join(dir, PID), { force: true }); };
  p.on('close', (code) => {
    soltar();
    if (sessaoId) anexarConversa(dir, sessaoId, titulo); // terminou (ou foi pausada): vira conversa da aba, com o título da etapa
    if (reiniciando.has(dir)) return; // morto pelo ⚡: quem segue é a retomada
    if (code && !falhou) erros.set(dir, erros.get(dir) || `código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}`);
    if (code && !falhou) gravar({ tipo: 'erro', texto: `O Claude parou com erro (código ${code})`, detalhe: `código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}` });
    aoMudar();
  });
  p.on('error', (e) => { falhou = true; erros.set(dir, e.message); soltar(); gravar({ tipo: 'erro', texto: `Não consegui rodar o Claude: ${e.message}` }); aoMudar(); });
  return true;
}

// Mata todas as execuções em segundo plano (claude -p); devolve quantas eram.
const parar = (dir) => { if (rodando.has(dir)) return rodando.get(dir).kill('SIGTERM'); const pid = pidDe(dir); if (vivo(pid)) process.kill(pid, 'SIGTERM'); };

module.exports = { GIT_LEITURA, rodar, parar };
