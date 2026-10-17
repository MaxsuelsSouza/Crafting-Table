// @ts-check
// Quantas vezes o Claude tentou cada comando: lê o histórico das sessões (~/.claude/projects/**/*.jsonl, as do claude -p da extensão e as
// interativas) e conta cada chamada de ferramenta pelo catálogo. Incremental: guarda até onde leu cada arquivo em
// ~/.cache/crafting-table/permissoes-historico.json, então só a primeira leitura é demorada. Assíncrono para não travar o VS Code.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RAIZ } = require('../area-ia');
const { itens } = require('./catalogo');

const CACHE = path.join(RAIZ, 'permissoes-historico.json');
const PROJETOS = () => path.join(os.homedir(), '.claude', 'projects');
const BLOCO = 8 * 1024 * 1024;
const VERSAO = 4; // muda quando o catálogo muda de forma: a contagem é refeita do zero

/** @returns {{ versao: number, arquivos: Record<string, number>, itens: Record<string, any> }} */
const ler = () => {
  try {
    const d = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (d.versao === VERSAO) return d;
  } catch {}
  return { versao: VERSAO, arquivos: {}, itens: {} };
};

const somar = (dados, linha) => {
  if (!linha.includes('"tool_use"')) return;
  let e;
  try {
    e = JSON.parse(linha);
  } catch {
    return;
  }
  if (e.type !== 'assistant') return;
  for (const c of e.message?.content || [])
    if (c.type === 'tool_use')
      for (const it of itens(c)) {
        const id = `${it.bloco}|${it.modulo}|${it.comando}`;
        (dados.itens[id] ||= { ...it, n: 0 }).n++;
      }
};

// Lê de onde parou até a última linha completa do arquivo.
async function lerArquivo(dados, arq) {
  const tam = (await fs.promises.stat(arq)).size;
  let pos = dados.arquivos[arq] || 0;
  if (tam < pos) pos = 0; // arquivo reescrito
  if (tam === pos) return;
  const fd = await fs.promises.open(arq, 'r');
  try {
    let resto = '';
    while (pos < tam) {
      const buf = Buffer.alloc(Math.min(BLOCO, tam - pos));
      const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      const txt = resto + buf.toString('utf8', 0, bytesRead),
        fim = txt.lastIndexOf('\n');
      pos += bytesRead;
      if (fim < 0) {
        resto = txt;
        continue;
      }
      txt.slice(0, fim).split('\n').forEach((l) => somar(dados, l));
      resto = txt.slice(fim + 1);
    }
    dados.arquivos[arq] = pos - Buffer.byteLength(resto); // linha incompleta: relida na próxima vez
  } finally {
    await fd.close();
  }
}

let emCurso = null;
/** Atualiza a contagem com o que entrou no histórico desde a última leitura. Chamadas simultâneas esperam a mesma leitura. */
const atualizar = () =>
  (emCurso ||= (async () => {
    const dados = ler();
    try {
      for (const p of await fs.promises.readdir(PROJETOS()).catch(() => [])) {
        const dir = path.join(PROJETOS(), p);
        for (const f of await fs.promises.readdir(dir).catch(() => []))
          if (f.endsWith('.jsonl')) await lerArquivo(dados, path.join(dir, f)).catch(() => {});
      }
      fs.mkdirSync(RAIZ, { recursive: true });
      fs.writeFileSync(`${CACHE}.tmp`, JSON.stringify(dados));
      fs.renameSync(`${CACHE}.tmp`, CACHE);
    } finally {
      emCurso = null;
    }
    return dados;
  })());

module.exports = { atualizar, ler, lendo: () => !!emCurso, _teste: { somar } };
