// @ts-check
const fs = require('fs');
const path = require('path');

// Documentos de uma pasta (ticket ou conversa), mais novos primeiro: usado pela aba Docs do painel.
function listar(pasta) {
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return []; }
  // .notas.html e evidencias/ também moram aqui, mas têm aba própria.
  return nomes.filter((n) => !n.startsWith('.')).map((nome) => {
    const full = path.join(pasta, nome);
    const atalho = fs.lstatSync(full).isSymbolicLink();
    let st;
    try { st = fs.statSync(full); } catch { return { nome, full, atalho, quebrado: true, mtime: 0 }; }
    return st.isFile() && { nome, full, atalho, origem: atalho ? fs.realpathSync(full) : null, mtime: st.mtimeMs };
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

exports._teste = { listar };
