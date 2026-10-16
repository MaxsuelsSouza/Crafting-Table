// @ts-check
// Aba Roteiro (painel): um item R01, R02… por cenário do plano que tem roteiro ou massa, desenhado pelo componente componentes/roteiros.js.
// Aberto: o roteiro que o Maestro executa (roteiros/CTnn.json) já com a massa anexada: as variáveis ${X} trocadas pelos valores da massa
// válida do cenário (a mesma troca que a jornada 6.2 faz). A massa é validada no banco antes de cada cenário, sem botão.
const path = require('path');
const { dataBr } = require('../../../componentes/card-cenario');
const roteiros = require('../../../componentes/roteiros');
const { lerJson } = require('../estado');
const { cenarios } = require('../etapas/02-cenarios/mapa');
const { massa } = require('../etapas/05-massa/estado');
const { ultimoRefresh, massaValida } = require('../etapas/05-massa/regras/validade');
const { ROTEIROS } = require('../etapas/06-execucao/roteiros');
const { substituir, resolverVars, varsDaMassa } = require('../etapas/06-execucao/regras/roteiro');
const { esc } = require('./comum');
const { CSS } = require('./css');

function roteiroHtml(dir, hora = '06:00') {
  const m = massa(dir),
    agora = new Date(),
    ref = ultimoRefresh(agora, hora);
  const pill = (i) =>
    i.estado === 'valida' && !massaValida(i, agora, hora)
      ? ['Vencida', 'desatualizado']
      : i.estado === 'valida'
        ? ['Válida', 'passou']
        : i.estado === 'consumida'
          ? ['Consumida', 'bloqueado']
          : ['Inválida', 'falhou'];
  const itemMassa = (i, morta = false) => ({
    id: i.id,
    papel: i.papel,
    dados: i.dados,
    consulta: i.consulta,
    medida: dataBr(i.medidaEm),
    pill: morta ? ['Morta', 'falhou'] : pill(i)
  });
  // Roteiro com a massa anexada: ${X} → valor da massa válida do cenário (variável sem massa fica como ${X}).
  const comMassa = (r, mm) => {
    if (!r) return null;
    const vars = resolverVars(r, varsDaMassa(mm.filter((i) => massaValida(i, agora, hora))));
    return { ...r, variaveis: vars, etapas: substituir(r.etapas || [], vars) };
  };
  // Um R por cenário ativo, na ordem do plano, que tenha roteiro gravado ou massa.
  const ativos = cenarios(dir).cenarios.filter((c) => !c.arquivado);
  const itens = ativos
    .map((c) => ({
      c,
      r: lerJson(path.join(dir, ROTEIROS, `${c.id}.json`), null),
      mm: m.itens.filter((i) => (i.cenarios || []).includes(c.id))
    }))
    .filter((x) => x.r || x.mm.length)
    .map(({ c, r, mm }, k) => ({
      id: `R${String(k + 1).padStart(2, '0')}`,
      descricao: r?.descricao || c.titulo,
      tag: c.id,
      pill: !r
        ? ['Sem roteiro', 'pendente']
        : r.hash === c.hash
          ? ['Pronto', 'passou']
          : ['Cenário mudou', 'desatualizado'],
      roteiro: comMassa(r, mm),
      semRoteiro: `Roteiro ainda não escrito: o ▶ escreve na Execução (Etapa 6) e o Maestro executa.${mm.length ? ` Massa já levantada: ${mm.map((i) => i.id).join(', ')}.` : ''}`
    }));
  // Massa de cenário que saiu do plano: fica num item à parte para não sumir.
  const ids = new Set(ativos.map((c) => c.id)),
    soltas = m.itens.filter((i) => !(i.cenarios || []).some((x) => ids.has(x)));
  if (soltas.length)
    itens.push({
      id: 'R—',
      descricao: 'Massa sem cenário no plano',
      roteiro: null,
      semRoteiro: `Os cenários desta massa saíram do plano: ${soltas.map((i) => i.id).join(', ')}.`
    });
  const mortas = (m.mortas || []).slice().reverse();
  return `${CSS}<style>${roteiros.CSS}</style><div class="qa-card"><b>Roteiros</b><p>Cada R é o roteiro que o Maestro executa num cenário (flows, bipes e consultas), já com os valores da massa de dados.
    A massa vale até o refresh do banco (último: ${esc(dataBr(ref.toISOString()))}; horário em Configurações → craftingTable.qaHoraRefresh) e é validada no banco antes de cada cenário.</p>
    <button data-acao="qaMassaEditar" title="Abre o .massa.json no editor (cole ou corrija dados à mão)">Editar massa à mão</button>
    ${itens.length ? '<button class="sec" data-expandir-tudo title="Abre ou fecha todos os roteiros">Expandir tudo</button>' : ''}</div>
    <div class="cens">${roteiros.html(itens) || '<div class="vazio-aba">Nenhum roteiro ainda. O ▶ do QA levanta a massa e escreve os roteiros antes de executar os cenários.</div>'}</div>
    ${mortas.length ? `<details class="qa-card"><summary><b style="display:inline">Massas mortas (${mortas.length})</b></summary><p>Massas de rodadas anteriores, trocadas por ↻ Refazer massa. Ficam só para consulta.</p><div class="cens">${mortas.map((i) => `<div class="cen"><div class="cdet">${roteiros.massa(itemMassa(i, true))}</div></div>`).join('')}</div></details>` : ''}`;
}

module.exports = { roteiroHtml };
