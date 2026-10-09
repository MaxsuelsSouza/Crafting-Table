// SessionStart: entrega as regras do foco ao Claude (o texto vai para o contexto da sessão). Nunca bloqueia.
const fs = require('fs');
const path = require('path');
try { process.stdout.write(fs.readFileSync(path.join(__dirname, '..', 'regras.md'), 'utf8')); } catch {}
