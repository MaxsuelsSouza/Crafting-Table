// @ts-check
const { esc } = require('../infra/texto');

// Componente "Caixa de etapas": a lista de etapas de um fluxo (Mergulho dos Incidentes; Refinamento e outros vão usar), cada uma com o seu
// estado, e a etapa atual em destaque. Para usar numa tela: CSS dentro do <style> e caixa({ ... }) no corpo. Sem script; redesenhe com a tela.
//   caixa({ titulo, acao, etapas, atual })
//     titulo: título da caixa (padrão "Etapas")  ·  acao: HTML opcional à direita do título (ex.: botão ▶ Iniciar)
//     etapas: [{ n, nome, estado, rotulo?, aberta?, subetapas?: [{ n?, nome, estado, rotulo? }] }]
//     atual: n da etapa atual (destaque)
//   estado: 'pendente' | 'rodando' | 'aguardando' (aprovação) | 'concluida' | 'erro' | 'pausada'
//   rotulo: texto ao lado do nome; o padrão sai do estado (pendente fica sem texto)
//   subetapas: quando a etapa É a atual (ou vem com aberta: true) a caixa expande sozinha e mostra N.1, N.2… com o estado de cada uma,
//     antes de qualquer processo começar; as outras etapas ficam recolhidas. Sem subetapas a etapa é uma linha só. `n` da subetapa
//     é opcional (padrão `${etapa.n}.${posição}`).
// Exemplo (Refinamento): caixa({ etapas: [{ n: 4, nome: 'Plano técnico', estado: 'rodando', subetapas: [
//   { nome: 'Mapeamento do código', estado: 'concluida' }, { nome: 'Plano técnico', estado: 'rodando' }] }], atual: 4 })

const ROTULOS = { pendente: '', rodando: 'em andamento', aguardando: 'aguardando sua aprovação', concluida: 'concluída', erro: 'com erro', pausada: 'pausada' };
const CLASSE = { concluida: 'feita', erro: 'erro', rodando: 'rodando', aguardando: 'aguardando', pausada: 'pausada', pendente: '' };

/** @param {{ n: string|number, nome: string, estado?: string, rotulo?: string }} x @param {boolean} atual @param {string} extra */
const linha = (x, atual, extra = '') => {
  const estado = x.estado || 'pendente', rot = x.rotulo ?? ROTULOS[estado] ?? '';
  const cls = [CLASSE[estado] || '', atual && estado !== 'concluida' ? 'atual' : '', extra].filter(Boolean).join(' ');
  return `<div class="ce-et ${cls}"><b>${estado === 'concluida' ? '✓' : esc(x.n)}</b>${esc(x.nome)}${rot ? `<span class="ce-rot">· ${esc(rot)}</span>` : ''}</div>`;
};

/** @param {{ titulo?: string, acao?: string, etapas: any[], atual?: string|number }} o */
const caixa = ({ titulo = 'Etapas', acao = '', etapas, atual }) => {
  const lista = etapas.map((e) => {
    const eAtual = e.n === atual, subs = Array.isArray(e.subetapas) ? e.subetapas : [];
    const abre = subs.length && (eAtual || e.aberta);
    return linha(e, eAtual) + (abre ? `<div class="ce-subs">${subs.map((s, i) => linha({ ...s, n: s.n ?? `${e.n}.${i + 1}` }, false, 'sub')).join('')}</div>` : '');
  }).join('');
  return `<div class="caixa-t">${esc(titulo)}<span>${acao}</span></div><div class="folha"><div class="ce-etapas">${lista}</div></div>`;
};

const CSS = `
  .ce-etapas { display: flex; flex-direction: column; gap: 4px; }
  .ce-et { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; color: var(--text-dim); }
  .ce-et b { flex: none; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 10.5px; }
  .ce-rot { color: var(--text-dim); font-size: 11px; }
  .ce-et.feita { color: var(--text); } .ce-et.feita b { background: var(--ok, #3fb950); border-color: var(--ok, #3fb950); color: #fff; }
  .ce-et.atual, .ce-et.rodando, .ce-et.aguardando { color: var(--text); }
  .ce-et.atual b, .ce-et.rodando b, .ce-et.aguardando b { border-color: var(--accent); color: var(--accent); }
  .ce-et.erro b { border-color: var(--danger); color: var(--danger); }
  .ce-subs { display: flex; flex-direction: column; gap: 2px; margin: 0 0 4px 10px; padding-left: 14px; border-left: 1px solid var(--border); }
  .ce-et.sub { font-size: 12px; padding: 2px 0; } .ce-et.sub b { width: auto; min-width: 22px; padding: 0 4px; border-radius: 10px; height: 17px; font-size: 10px; }
`;

module.exports = { caixa, CSS, ROTULOS };
