// @ts-check
const path = require('path');
const { lerJson, gravarJson, estado } = require('../../estado');

// ── Massa de dados (.massa.json, aba Roteiro). Vale até o próximo refresh do banco (cópia de produção renovada todo dia):
// sem um sinal do restore no banco, o refresh é um horário configurável (craftingTable.qaHoraRefresh).
const MASSA = '.massa.json';
const massa = (dir) => lerJson(path.join(dir, MASSA), { itens: [] });
function massaAdd(dir, { papel, cenarios: cens, dados, consulta = '', origem = 'consulta', desfazer = [] }) {
  const m = massa(dir),
    id = `M${[...m.itens, ...(m.mortas || [])].reduce((n, i) => Math.max(n, Number(i.id.slice(1)) || 0), 0) + 1}`;
  m.itens.push({
    id,
    papel: papel || '',
    cenarios: cens || [],
    dados: dados || {},
    consulta: consulta || '',
    medidaEm: new Date().toISOString(),
    estado: 'valida',
    ...(origem === 'sql' ? { origem, desfazer } : {})
  });
  gravarJson(path.join(dir, MASSA), m);
  return id;
}
// A Etapa 4 marca `etapa: 'massa'` no estado enquanto levanta; o qa-state só aceita `massa add` nessa janela (a Execução só usa o que sobrou dela).
const emEtapaMassa = (dir) => estado(dir).etapa === 'massa';
function massaEstado(dir, id, est) {
  if (!['valida', 'consumida', 'invalida'].includes(est))
    throw new Error(`estado inválido: ${est} (use valida, consumida, invalida)`);
  const m = massa(dir),
    i = m.itens.find((x) => x.id === id);
  if (!i) throw new Error(`massa ${id} não existe`);
  i.estado = est;
  if (est === 'valida') i.medidaEm = new Date().toISOString();
  gravarJson(path.join(dir, MASSA), m);
}

module.exports = { MASSA, massa, massaAdd, emEtapaMassa, massaEstado };
