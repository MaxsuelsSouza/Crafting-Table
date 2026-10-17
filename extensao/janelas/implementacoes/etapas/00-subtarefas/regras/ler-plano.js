// @ts-check
// Lê o plano-subtarefas.md que o Claude grava (texto simples, sem JSON: o verificador de comandos bloqueia chaves coladas em aspas no heredoc)
// e devolve o plano estruturado. Formato (prompt.js):
//   Execução: unico | sequencia | paralelo
//   ## G1 · <título>
//   - Subtarefas: WMS-101, WMS-102
//   - Camadas: backend
//   - Arquivos: src/a.java, src/b.java
//   - Depende de: nenhum | G1
//   - Por que: <motivo>
// Seções "## " que não são grupo (Ordem, Já feito, Riscos) são só para você ler.
const SEM = /^(nenhum|nenhuma|-|—|n\/a|não|nao)$/i;
const lista = (v) =>
  String(v || '')
    .split(/[,;]/)
    .map((x) => x.replace(/`/g, '').trim())
    .filter((x) => x && !SEM.test(x));
const campo = (bloco, nome) => {
  const m = new RegExp(`^\\s*[-*]?\\s*\\**${nome}\\**\\s*:\\s*(.*)$`, 'im').exec(bloco);
  return m ? m[1].trim() : '';
};
const normalizar = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** @param {string} md */
function lerPlanoMd(md) {
  const texto = String(md || '');
  const execucao = normalizar(/^\s*\**execu[çc][ãa]o\**\s*:\s*\**\s*([a-zçãé]+)/im.exec(texto)?.[1]);
  const partes = texto.split(/^##\s+/m).slice(1);
  const grupos = partes
    .map((p) => {
      const [cab, ...resto] = p.split('\n'),
        m = /^(G\d+)\s*(?:[·:\-–—]\s*(.*))?$/i.exec(cab.trim());
      if (!m) return null;
      const bloco = resto.join('\n');
      return {
        id: m[1].toUpperCase(),
        titulo: (m[2] || '').trim(),
        subtarefas: lista(campo(bloco, 'Subtarefas')).map((x) => x.toUpperCase()),
        camadas: lista(campo(bloco, 'Camadas')).map((x) => x.toLowerCase()),
        arquivos: lista(campo(bloco, 'Arquivos')),
        dependeDe: lista(campo(bloco, 'Depende de')).map((x) => x.toUpperCase()),
        porque: campo(bloco, 'Por que')
      };
    })
    .filter(Boolean);
  return { execucao, grupos };
}

module.exports = { lerPlanoMd };
