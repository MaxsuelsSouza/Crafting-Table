// @ts-check
// Execuções em segundo plano desta janela (processo, último erro, últimas opções, mortos pelo ⚡), o pid/sid na pasta do ticket
// e o executável do claude. Comum a rodar.js e instruir.js.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SID = '.ao-vivo.sid', PID = '.ao-vivo.pid';

const rodando = new Map(); // pasta do ticket -> processo (desta janela)
const erros = new Map(); // pasta -> motivo do último erro do Claude (is_error do stream, código de saída ou falha ao subir); o QA lê para pausar a fila
const ultimas = new Map(); // pasta -> opções da última execução (para o ⚡ retomar a sessão com uma instrução)
const reiniciando = new Set(); // pastas cujo processo foi morto pelo ⚡: o fim dele não avança a etapa (a retomada herda o aoMudar)
// Execução de outra janela do VS Code (ou de antes de recarregar): o pid fica em .ao-vivo.pid enquanto o claude roda.
// Confere que o pid ainda é um claude (o executável, não um caminho com "claude" no meio): pid pode ser reaproveitado.
const vivo = (pid) => { try { process.kill(pid, 0); return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').slice(0, 2).some((a) => path.basename(a) === 'claude'); } catch { return false; } };
const pidDe = (dir) => { try { return Number(fs.readFileSync(path.join(dir, PID), 'utf8')) || null; } catch { return null; } };
const rodandoEm = (dir) => rodando.has(dir) || vivo(pidDe(dir));

const claudeBin = () => [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'].find((p) => fs.existsSync(p)) || 'claude';

module.exports = { SID, PID, rodando, erros, ultimas, reiniciando, vivo, pidDe, rodandoEm, claudeBin };
