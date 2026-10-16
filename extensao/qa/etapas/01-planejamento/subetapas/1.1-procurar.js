// @ts-check
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { reconciliar } = require('../../../orquestrador/reconciliar');
const { cenariosDo } = require('../../02-cenarios/regras/parser');
const { sincronizar } = require('../../02-cenarios/mapa');
const { candidatas, temPlano } = require('../regras/subtarefa');
const { versionar, versaoAtual } = require('../versoes');
const { onde } = require('../dependencias');
const { PLANO_LOCAL, planoLocal } = require('./1.2-plano-local');

// Subtarefas (filhos) do ticket com a descrição em Markdown: uma chamada só. filhos = (chave) => Promise<[{ key, resumo, updated, status, md }]>
// (o filhos do provedor, já autenticado).
async function procurar(filhos, chave) {
  const subs = await filhos(chave);
  const qa = candidatas(subs);
  // Plano = subtarefa de QA de que o parser tira cenários. Sem isso, as subtarefas de QA com algum texto viram "fontes": o Claude lê e
  // interpreta (promptInterpretar), em vez de a extensão esperar um padrão de texto.
  const plano = qa.find((s) => cenariosDo(s.md || '').length) || null;
  const fontes = plano ? [] : qa.filter((s) => String(s.md || '').trim().length > 40 || temPlano(s.md));
  return { plano, qa, fontes };
}

// ▶ do QA: acha o plano no provedor (ou em qa-plano.md) e versiona em Docs. Plano novo (ou mudado) espera a aprovação do humano; já aprovado, lista os cenários.
async function verificarPlano(dir, chave, filhos) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  reconciliar(dir);
  if (estado(dir).publicarPendente && versaoAtual(dir) && estado(dir).fase === 'plano_encontrado') {
    // plano local à espera do seu Aprovar: o provedor ainda não o tem
    vivo(
      'aviso',
      `Aguardando você: abra o planejamento v${versaoAtual(dir).v} no cartão acima, peça mudanças ou aprove (aprovar publica no ${onde(dir)})`
    );
    return;
  }
  vivo('etapa', 'QA · 1. Planejamento');
  vivo('acao', `Lendo as subtarefas do ${chave} no ${onde(dir)}`);
  mudar(dir, { fase: 'procurando', erro: null, chave });
  let r;
  try {
    r = await procurar(filhos, chave);
  } catch (e) {
    vivo('erro', `Não consegui ler o ticket no ${onde(dir)}: ${e.message}`);
    return mudar(dir, { fase: 'erro', erro: e.message });
  }
  vivo(
    'acao',
    r.qa.length
      ? `Subtarefas com QA no nome: ${r.qa.map((x) => `${x.key} (${x.resumo})`).join(', ')}`
      : 'Nenhuma subtarefa com QA no nome'
  );
  if (!r.plano) {
    // sem subtarefa com plano no provedor (ex.: sem subtarefas): vale o arquivo local
    const l = planoLocal(dir);
    if (l)
      r.plano = {
        key: chave,
        resumo: `Plano de QA (${PLANO_LOCAL})`,
        updated: new Date(l.mtime).toISOString(),
        md: l.md
      };
  }
  if (!r.plano) {
    vivo(
      'aviso',
      r.qa.length
        ? 'Nenhuma delas tem cenários (CT01, Cenário 1, Dado que…): o QA só começa com o planejamento'
        : 'Sem planejamento de QA: o QA só começa com ele. Crie pelo cartão acima'
    );
    if (r.fontes.length)
      vivo(
        'acao',
        `Texto de QA em ${r.fontes.map((x) => x.key).join(', ')} fora do formato esperado: o Claude vai ler e interpretar`
      );
    return mudar(dir, { fase: 'sem_plano', subtarefas: r.qa.map((x) => x.key), fontes: r.fontes.map((x) => x.key) });
  }
  const n = cenariosDo(r.plano.md).length,
    v = versionar(dir, r.plano);
  vivo('acao', `Planejamento encontrado em ${r.plano.key}: ${n} cenário(s)`);
  vivo('fim', v.nova ? `Salvo na aba Docs como ${v.arquivo}` : `Mesmo texto da v${v.v} (já está na aba Docs)`);
  const e = estado(dir);
  if (e.aprovado?.versao === v.v && e.aprovado.subtarefa === r.plano.key) {
    const m = sincronizar(dir, r.plano.md, v.v);
    vivo('fim', `Planejamento v${v.v} já aprovado: ${m.total} cenário(s) listados abaixo`);
    return mudar(dir, { fase: 'plano_aprovado', subtarefa: r.plano.key, versao: v.v });
  }
  vivo('aviso', `Aguardando você: abra o planejamento v${v.v} no cartão acima, peça mudanças ou aprove`);
  return mudar(dir, { fase: 'plano_encontrado', subtarefa: r.plano.key, versao: v.v });
}

module.exports = { procurar, verificarPlano };
