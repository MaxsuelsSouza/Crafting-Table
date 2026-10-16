// @ts-check
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { mudar } = require('../../../estado');
const { cenariosDo } = require('../../02-cenarios/regras/parser');
const { versionar } = require('../versoes');
const { onde } = require('../dependencias');

// ── Planejamento: a IA só escreve o plano em Markdown numa pasta local (qa-plano.md); quem publica no provedor é a extensão (publicarPlano).
// Sem ferramentas do provedor (MCP): o contexto do ticket vai num arquivo (.ticket-contexto.md, buscado pelo provedor).
const PLANO_LOCAL = 'qa-plano.md',
  CONTEXTO = '.ticket-contexto.md';
// Plano escrito pela IA em PLANO_LOCAL (null se não existe ou não tem cenários).
function planoLocal(dir) {
  try {
    const arq = path.join(dir, PLANO_LOCAL),
      md = fs.readFileSync(arq, 'utf8');
    return cenariosDo(md).length ? { md, mtime: fs.statSync(arq).mtimeMs } : null;
  } catch {
    return null;
  }
}
// O plano que a IA escreveu fica só local (versão nova na aba Docs) até o humano abrir, ler e aprovar: o provedor só recebe depois.
function proporPlano(dir, chave) {
  const p = planoLocal(dir);
  if (!p) throw new Error(`O Claude não gravou ${PLANO_LOCAL} com cenários (CT01…)`);
  const v = versionar(dir, {
    key: chave,
    resumo: `Plano de QA (${PLANO_LOCAL}, ainda não publicado)`,
    updated: new Date(p.mtime).toISOString(),
    md: p.md
  });
  aoVivo.anotar(dir, {
    tipo: 'fim',
    texto: `Plano v${v.v} pronto, só local: ${v.nova ? `salvo como ${v.arquivo}` : 'mesmo texto da versão anterior'}`
  });
  aoVivo.anotar(dir, {
    tipo: 'aviso',
    texto: `Aguardando você: abra o planejamento v${v.v}, leia e aprove (aprovar publica no ${onde(dir)})`
  });
  mudar(dir, {
    fase: 'plano_encontrado',
    subtarefa: chave,
    versao: v.v,
    publicarPendente: true,
    erro: null,
    pedido: null,
    pausa: null
  });
  return v;
}

module.exports = { PLANO_LOCAL, CONTEXTO, planoLocal, proporPlano };
