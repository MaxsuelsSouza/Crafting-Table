// @ts-check
// Versões do plano (planejamento-qa-vN.md na aba Docs) e o índice .planejamento.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { lerJson, gravarJson } = require('../../estado');

const INDICE = '.planejamento.json';
// Grava a versão nova do plano se a descrição mudou. Devolve { v, arquivo, nova }.
function versionar(dir, s) {
  const ind = lerJson(path.join(dir, INDICE), { versoes: [] });
  const hash = crypto.createHash('sha1').update(s.md).digest('hex').slice(0, 12);
  const ult = ind.versoes.at(-1);
  if (ult && ult.hash === hash && ult.subtarefa === s.key) return { ...ult, nova: false };
  const v = (ult?.v || 0) + 1,
    arquivo = `planejamento-qa-v${v}.md`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, arquivo),
    `# Planejamento de QA · v${v}\n\nFonte: ${s.key} · ${s.resumo} · atualizado em ${s.updated}\n\n---\n\n${s.md}\n`
  );
  const nova = {
    v,
    arquivo,
    hash,
    subtarefa: s.key,
    resumo: s.resumo,
    jiraUpdated: s.updated,
    em: new Date().toISOString()
  };
  gravarJson(path.join(dir, INDICE), { ...ind, versoes: [...ind.versoes, nova] });
  return { ...nova, nova: true };
}
const versaoAtual = (dir) => lerJson(path.join(dir, INDICE), { versoes: [] }).versoes.at(-1) || null;
// Texto do plano de uma versão (sem o cabeçalho que versionar() põe).
const mdDaVersao = (dir, v) => {
  const t = fs.readFileSync(path.join(dir, v.arquivo), 'utf8');
  return t.slice(t.indexOf('\n---\n\n') + 6);
};

module.exports = { INDICE, versionar, versaoAtual, mdDaVersao };
