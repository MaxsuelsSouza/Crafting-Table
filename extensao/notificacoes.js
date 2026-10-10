// @ts-check
const fs = require('fs');
const path = require('path');
const { pasta, lerTexto } = require('./refinamento/locais');

// Notificações: .notificacoes.jsonl da pasta (hook notificacoes.py e sdd-state); lidas = mais antigas que .notificacoes.lidas.
const NOTIF = '.notificacoes.jsonl', LIDAS = '.notificacoes.lidas';
const ICONE_NOTIF = { fim: '✓', permissao: '⚠', sdd: '◆', duvida: '?', aviso: '•', jira: '◇', mudanca: '⚠' };
// Grava uma linha no 🔔 do ticket (o encaminhador do Teams lê as mesmas linhas).
const notificar = (chave, tipo, texto) => { try { fs.appendFileSync(path.join(pasta(chave), NOTIF), JSON.stringify({ em: new Date().toISOString(), tipo, texto }) + '\n'); } catch {} };
const notifsDe = (dir) => {
  const linhas = (dir && lerTexto(path.join(dir, NOTIF))) || '';
  return linhas.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).reverse().slice(0, 50);
};


// Caixa Comandos do rodapé aberta (a tela se redesenha a cada terminal aberto/fechado).
let aberta = false;
const cmdsAberto = () => aberta;
// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`.
const acoes = (s) => ({
  cmdsAlternar() { aberta = !aberta; },
  cmdAlternar({ id }) { require('./comandos').api?.alternar({ id }); },
  emuAlternar({ id }) { require('./emulador').api?.alternar({ id }); },
  notifLidas() { const dir = s.aberto && s.pastaAba(s.aberto); if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, LIDAS), new Date().toISOString()); } }
});

module.exports = { NOTIF, LIDAS, ICONE_NOTIF, notificar, notifsDe, cmdsAberto, acoes };
