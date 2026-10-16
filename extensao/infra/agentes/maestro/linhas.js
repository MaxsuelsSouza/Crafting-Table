// @ts-check
// Evento do stream-json do claude -p → linhas do Ao vivo.
const { curto } = require('./textos');
const { falas, decisaoDeTeste } = require('./decisoes');

// Evento do stream-json → linhas { tipo, texto, detalhe? } (vazio = ignora).
function linhas(e) {
  if (e.type === 'assistant') return (e.message?.content || []).flatMap((c) => (c.type === 'text' && c.text.trim() ? falas(c.text.trim())
    : c.type === 'tool_use' ? decisaoDeTeste(c) : []));
  if (e.type === 'system' && e.subtype === 'permission_denied') return [{ tipo: 'aviso', texto: `Bloqueado: ação fora do permitido nesta etapa (${e.tool_name || 'ferramenta'})`, detalhe: curto(e.message) }];
  if (e.type === 'user') return (Array.isArray(e.message?.content) ? e.message.content : [])
    .filter((c) => c.type === 'tool_result' && /hook error/.test(String(c.content)))
    .map((c) => ({ tipo: 'aviso', texto: `Regra do SDD: ${curto(String(c.content).replace(/^.*hook error:\s*/, '')).slice(0, 160)}` }));
  if (e.type === 'result') return [{ tipo: e.is_error ? 'erro' : 'fim', texto: `${e.is_error ? 'Etapa terminou com erro' : 'Etapa concluída'} · ${Math.round((e.duration_ms || 0) / 1000)} s · US$ ${(e.total_cost_usd || 0).toFixed(2).replace('.', ',')}` }];
  return [];
}

module.exports = { linhas };
