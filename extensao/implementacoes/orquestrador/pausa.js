// @ts-check
const fs = require('fs');
const path = require('path');
const { PAUSA, PAUSA_MD, lerJson } = require('../estado');

// Pausa pedida pelo Claude: .pausa.md em texto simples ("motivo:", "pergunta:", "opcoes:" + "- item"); o JSON antigo (.pausa.json) continua valendo.
// Não é JSON porque o verificador de comandos do Claude Code bloqueia chaves coladas em aspas dentro do heredoc do implementacao-gravar.
const parsePausa = (txt) => {
  const linhas = String(txt).split('\n'),
    rot = (l, nome) => new RegExp(`^\\s*${nome}\\s*:\\s*(.*)$`, 'i').exec(l);
  const iOp = linhas.findIndex((l) => /^\s*opcoes\s*:\s*$/i.test(l)),
    iPe = linhas.findIndex((l) => rot(l, 'pergunta'));
  const corpo = linhas.slice(iPe >= 0 ? iPe : 0, iOp >= 0 ? iOp : undefined);
  const pergunta = corpo
    .map((l, i) => (i === 0 && iPe >= 0 ? rot(l, 'pergunta')[1] : l))
    .filter((l) => !rot(l, 'motivo'))
    .join('\n')
    .trim();
  const motivo = linhas.map((l) => rot(l, 'motivo')?.[1]).find(Boolean) || '';
  const opcoes =
    iOp < 0
      ? []
      : linhas
          .slice(iOp + 1)
          .map((l) => /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(l)?.[1])
          .filter(Boolean);
  return pergunta ? { motivo: motivo.trim(), pergunta, opcoes } : null;
};
const lerPausa = (dir) => {
  try {
    const p = parsePausa(fs.readFileSync(path.join(dir, PAUSA_MD), 'utf8'));
    if (p) return p;
  } catch {
    /* sem .pausa.md */
  }
  return lerJson(path.join(dir, PAUSA), null);
};
const limparPausa = (dir) => {
  fs.rmSync(path.join(dir, PAUSA), { force: true });
  fs.rmSync(path.join(dir, PAUSA_MD), { force: true });
};

module.exports = { parsePausa, lerPausa, limparPausa };
