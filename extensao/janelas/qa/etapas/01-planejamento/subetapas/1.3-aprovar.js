// @ts-check
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { lerJson, gravarJson, estado, mudar } = require('../../../estado');
const { cenariosDo } = require('../../02-cenarios/regras/parser');
const { sincronizar } = require('../../02-cenarios/mapa');
const { alvosPublicacao, nomeSubtarefa } = require('../regras/subtarefa');
const { NOVA, perguntarSubtarefa } = require('../regras/escolher-subtarefa');
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
  if (r.modo === 'pergunta') {
    vivo('aviso', `Mais de uma subtarefa de QA (${r.candidatas.join(', ')}): responda no cartão em qual publicar`);
    return false;
  }
  vivo(
    'fim',
    r.modo === 'criada'
      ? `Subtarefa ${r.key} criada com o plano`
      : r.modo === 'atualizada'
        ? `Descrição de ${r.key} atualizada com o plano`
        : r.modo === 'comentada'
          ? `Plano publicado como comentário em ${r.key} (a descrição dela, que já tinha texto, não mudou)`
          : `Plano publicado como comentário no ${r.key}`
  );
  // A versão aprovada passa a ser a do provedor (ele pode normalizar o texto); sem isso o próximo ▶ pediria a aprovação de novo.
  const ind = lerJson(path.join(dir, INDICE), { versoes: [] }),
    ult = ind.versoes.at(-1);
  if (ult) {
    ult.subtarefa = r.key;
    gravarJson(path.join(dir, INDICE), ind);
  }
  if (r.modo === 'comentada') {
    // A descrição da subtarefa não é o plano: vale a versão local (procurar() traria o texto antigo da descrição).
    mudar(dir, { fase: 'plano_encontrado', subtarefa: r.key, versao: versaoAtual(dir).v });
    if (!aprovar(dir)) return false;
    mudar(dir, { aprovado: { ...estado(dir).aprovado, comentario: true } });
    return true;
  }
  const achado = await procurar(deps.filhos, deps.chave).catch(() => null);
  const v = achado?.plano ? versionar(dir, achado.plano) : versaoAtual(dir);
  mudar(dir, { fase: 'plano_encontrado', subtarefa: v.subtarefa, versao: v.v });
  return aprovar(dir);
}
// Tipo do ticket pai (decide o nome da subtarefa): o que o painel passou (deps.tipo) ou o do ticket local (.ticket.json).
function tipoPai(dir, deps) {
  if (deps.tipo !== undefined) return deps.tipo;
  try {
    return require('../../../../../infra/ticket/tickets').ler(path.basename(path.dirname(dir)))?.tipo;
  } catch {
    return undefined;
  }
}
// Publica o plano local no provedor (casamento e nome da subtarefa do plugin, infra/testes/nome-subtarefa.js):
//   uma subtarefa [QA] de planejamento sem descrição → preenche a descrição; com descrição → comentário nela (não sobrescreve);
//   mais de uma → pausa e pergunta (regras/escolher-subtarefa.js); nenhuma → cria "[QA] Planejamento…" (história) ou "[QA] Teste de Qualidade";
//   sem subtarefas no provedor → comentário no ticket (o arquivo local segue como fonte).
// deps: { chave, tipo?, filhos, subtarefas, criarSubtarefa, atualizarDescricao, comentar, comentarEm? (key, md) }.
async function publicarPlano(dir, deps) {
  const p = planoLocal(dir);
  if (!p) throw new Error(`O Claude não gravou ${PLANO_LOCAL} com cenários (CT01…)`);
  const tipo = tipoPai(dir, deps),
    titulo = nomeSubtarefa(tipo);
  if (!deps.subtarefas) {
    await deps.comentar(`**${titulo}** (Crafting Table)\n\n${p.md}`);
    return { modo: 'comentario', key: deps.chave };
  }
  const alvos = alvosPublicacao(await deps.filhos(deps.chave), tipo),
    escolha = estado(dir).subtarefaQa;
  const alvo = escolha === NOVA ? null : alvos.length === 1 ? alvos[0] : alvos.find((s) => s.key === escolha);
  if (!alvo && alvos.length > 1 && escolha !== NOVA) return perguntarSubtarefa(dir, deps.chave, alvos);
  mudar(dir, { subtarefaQa: null });
  if (alvo && String(alvo.md || '').trim()) {
    const md = `**Plano de testes aprovado** (Crafting Table)\n\n${p.md}`;
    if (deps.comentarEm) await deps.comentarEm(alvo.key, md);
    else await deps.comentar(`**Plano de testes para ${alvo.key}** (Crafting Table)\n\n${p.md}`);
    return { modo: 'comentada', key: alvo.key };
  }
  if (alvo) {
    await deps.atualizarDescricao(alvo.key, p.md);
    return { modo: 'atualizada', key: alvo.key };
  }
  const { key } = await deps.criarSubtarefa({ resumo: titulo, descricao: p.md });
  return { modo: 'criada', key };
}

module.exports = { aprovar, aprovarPublicando, publicarPlano };
