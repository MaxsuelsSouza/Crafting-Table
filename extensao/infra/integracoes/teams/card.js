// @ts-check
// O que vai para o Teams: tipos e níveis ligados, a janela de agrupamento e o Adaptive Card de cada grupo de linhas do 🔔.
const fs = require('fs');
const os = require('os');
const { provedorAtivo } = require('../../provedores');

const TIPOS = ['sdd', 'pergunta', 'jira']; // ajuste aqui o que vai para o Teams (mudanca tem regra própria, abaixo)
const NIVEIS = ['MEDIO', 'ALTO']; // impacto abaixo disso não vai
const COR = { ALTO: 'Attention', MEDIO: 'Warning' };
const JANELA = 60e3; // linhas do mesmo ticket e tipo dentro disso viram uma mensagem
const SOSSEGO = 20e3; // o grupo só sai depois de ficar esse tempo sem linha nova (a rajada acabou)
const MAX_FALHAS = 3;
const ENVIADO = '.teams.enviado'; // ISO da última linha já enviada
const TITULO = { sdd: 'Spec', pergunta: 'Perguntas', jira: 'Ticket' };

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const ms = (iso) => Date.parse(iso) || 0; // o hook (Python) e o sdd-state (JS) escrevem ISO em formatos diferentes

function card({ titulo, texto, fatos = [], links = [], cor = 'Default' }) {
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
    body: [
      { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', color: cor },
      { type: 'TextBlock', text: texto, wrap: true },
      ...(fatos.length ? [{ type: 'FactSet', facts: fatos.map(([title, value]) => ({ title, value })) }] : [])
    ],
    ...(links.length ? { actions: links.map(([title, url]) => ({ type: 'Action.OpenUrl', title, url })) } : [])
  } }] };
}

// Linhas novas de um ticket → mensagens (cards). `impactos`/`tarefas` dão os dados ricos do impacto.
function mensagens(t, linhas, impactos = [], tarefas = []) {
  const doc = t.provedor === 'documento' || String(t.site || '').startsWith('documento:'); // sem link fora da máquina
  const abrir = doc ? null : [`Abrir no ${provedorAtivo().nome}`, provedorAtivo().linkDo(t.site, t.idProvedor ?? t.chave)];
  const out = [], grupos = [];
  for (const l of linhas) {
    if (l.tipo === 'mudanca') { // mudança pedida em comentário do Jira, esperando decisão no painel
      const quem = t.refinamento?.iniciadoPor;
      if (quem && quem !== os.userInfo().username) continue; // o aviso é de quem iniciou o refinamento
      const nivel = /impacto (\w+)/i.exec(l.texto)?.[1].toUpperCase(); // "analisando o impacto" não casa
      if (!NIVEIS.includes(nivel)) continue;
      const autor = /^Comentário de (.+?): impacto/.exec(l.texto)?.[1];
      const i = impactos.slice().reverse().find((x) => x.nivel?.toUpperCase() === nivel && (!autor || x.autor === autor));
      const cards = (i?.cards || []).map((id) => (({ ticket, jira } = {}) => ticket ?? jira)(tarefas.find((c) => c.id === id)) || id);
      out.push({ em: ms(l.em), msg: card({ titulo: `${t.chave} · Mudança pedida · ${nivel}`, texto: `${i ? `Comentário de ${i.autor}: ${i.resumo}` : l.texto}\nNada foi alterado: decida no painel.`,
        cor: COR[nivel], links: [...(abrir ? [abrir] : []), ...(i?.link ? [['Ver comentário', i.link]] : [])],
        fatos: [...(i && i.passo != null ? [['Spec', `passo ${i.passo} afetado`]] : []), ...(cards.length ? [['Revisar', cards.join(', ')]] : []), ...(quem ? [['Refinamento de', quem]] : [])] }) });
    } else if (TIPOS.includes(l.tipo)) {
      const g = grupos.find((x) => x.tipo === l.tipo && ms(l.em) - x.fim <= JANELA);
      if (g) { g.linhas.push(l); g.fim = ms(l.em); } else grupos.push({ tipo: l.tipo, linhas: [l], fim: ms(l.em) });
    }
  }
  for (const g of grupos) {
    const n = g.linhas.length;
    out.push({ em: g.fim, msg: card({ titulo: `${t.chave} · ${TITULO[g.tipo]}`, links: abrir ? [abrir] : [],
      texto: g.tipo === 'pergunta' && n > 1 ? `O Claude tem ${n} perguntas esperando você` : g.linhas.map((l) => l.texto).join('\n\n') }) });
  }
  return out.sort((a, b) => a.em - b.em);
}

module.exports = { TIPOS, NIVEIS, COR, JANELA, SOSSEGO, MAX_FALHAS, ENVIADO, TITULO, ler, ms, card, mensagens };
