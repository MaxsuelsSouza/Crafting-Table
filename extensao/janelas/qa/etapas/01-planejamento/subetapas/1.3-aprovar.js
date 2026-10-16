// @ts-check
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { lerJson, gravarJson, estado, mudar } = require('../../../estado');
const { cenariosDo } = require('../../02-cenarios/regras/parser');
const { sincronizar } = require('../../02-cenarios/mapa');
const { candidatas, TITULO_SUBTAREFA } = require('../regras/subtarefa');
const { INDICE, versionar, versaoAtual, mdDaVersao } = require('../versoes');
const { ehLocal, nomeProvedor } = require('../dependencias');
const { procurar } = require('./1.1-procurar');
const { PLANO_LOCAL, planoLocal } = require('./1.2-plano-local');

// Aprovar: os cenários da versão aprovada vão para o mapa e o QA espera o Dar início.
function aprovar(dir) {
  const e = estado(dir),
    v = versaoAtual(dir);
  if (e.fase !== 'plano_encontrado' || !v) return false;
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  if (!cenariosDo(mdDaVersao(dir, v)).length) {
    // nunca aprovar um plano sem cenários: seria um QA travado em "0 cenário(s)"
    vivo('aviso', 'Este planejamento não tem nenhum cenário reconhecível: peça ajuste para o Claude reorganizá-lo');
    return false;
  }
  const m = sincronizar(dir, mdDaVersao(dir, v), v.v);
  vivo('etapa', 'QA · 2. Cenários');
  vivo('fim', `Planejamento v${v.v} aprovado`);
  vivo(
    'fim',
    `${m.total} cenário(s) listados abaixo${m.mudaram ? ` · ${m.mudaram} mudaram desde a última versão` : ''}${m.sairam ? ` · ${m.sairam} saíram do plano` : ''}`
  );
  vivo('acao', 'Clique em Dar início para subir o ambiente e executar os cenários');
  mudar(dir, {
    fase: 'plano_aprovado',
    publicarPendente: false,
    aprovado: { versao: v.v, subtarefa: v.subtarefa, em: new Date().toISOString() }
  });
  return true;
}
// Aprovar um plano local: publica no provedor (portão passou), reconcilia a versão com o texto que o provedor guardou e aprova.
async function aprovarPublicando(dir, deps) {
  const e = estado(dir);
  if (e.fase !== 'plano_encontrado' || !e.publicarPendente || !versaoAtual(dir)) return aprovar(dir);
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('acao', ehLocal(dir) ? 'Salvando o plano no documento' : `Publicando o plano aprovado no ${nomeProvedor()}`);
  const r = await publicarPlano(dir, deps);
  vivo(
    'fim',
    r.modo === 'criada'
      ? `Subtarefa ${r.key} criada com o plano`
      : r.modo === 'atualizada'
        ? `Descrição de ${r.key} atualizada com o plano`
        : `Plano publicado como comentário no ${r.key}`
  );
  // A versão aprovada passa a ser a do provedor (ele pode normalizar o texto); sem isso o próximo ▶ pediria a aprovação de novo.
  const ind = lerJson(path.join(dir, INDICE), { versoes: [] }),
    ult = ind.versoes.at(-1);
  if (ult) {
    ult.subtarefa = r.key;
    gravarJson(path.join(dir, INDICE), ind);
  }
  const achado = await procurar(deps.filhos, deps.chave).catch(() => null);
  const v = achado?.plano ? versionar(dir, achado.plano) : versaoAtual(dir);
  mudar(dir, { fase: 'plano_encontrado', subtarefa: v.subtarefa, versao: v.v });
  return aprovar(dir);
}
// Publica o plano local no provedor: subtarefa [QA] nova (criarSubtarefa) ou a existente (atualizarDescricao); sem subtarefas no provedor,
// comentário no ticket (o arquivo local segue como fonte). deps: { chave, filhos, subtarefas, criarSubtarefa, atualizarDescricao, comentar }.
async function publicarPlano(dir, deps) {
  const p = planoLocal(dir);
  if (!p) throw new Error(`O Claude não gravou ${PLANO_LOCAL} com cenários (CT01…)`);
  if (!deps.subtarefas) {
    await deps.comentar(`**${TITULO_SUBTAREFA}** (Crafting Table)\n\n${p.md}`);
    return { modo: 'comentario', key: deps.chave };
  }
  const existente = candidatas(await deps.filhos(deps.chave))[0];
  if (existente) {
    await deps.atualizarDescricao(existente.key, p.md);
    return { modo: 'atualizada', key: existente.key };
  }
  const { key } = await deps.criarSubtarefa({ resumo: TITULO_SUBTAREFA, descricao: p.md });
  return { modo: 'criada', key };
}

module.exports = { aprovar, aprovarPublicando, publicarPlano };
