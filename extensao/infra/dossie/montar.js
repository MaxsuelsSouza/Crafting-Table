// @ts-check
// Monta o dossiê do ticket: lê o disco (spec, cards, incidente, QA, descrição, briefing do dev, trabalho já feito) e normaliza em três eixos
// (alvo, pronto, onde) com a confiança de cada fonte; daí saem a prontidão e o modo da esteira. Visão geral: index.js.
const fs = require('fs');
const path = require('path');
const tickets = require('../ticket/tickets');
const { dirSpec, estadoSpec, tarefasDe, arqHandoff } = require('../ticket/spec');
const { ler } = require('../ticket/pasta-ticket');
const tipoTicket = require('../ticket/tipo-ticket');
const { BRIEFING, TRABALHO } = require('./arquivos');
const { sobreTicket } = require('./ticket');
const { rank, nivelDe, capacidadesDe } = require('./confianca');
const { trabalhoExistente } = require('./trabalho-existente');

/** @typedef {import('./confianca').Item} Item */
const existe = (f) => { try { return fs.statSync(f).size > 0; } catch { return false; } };
const subpasta = (t, lista) => tickets.pasta(t.chave, lista);

/**
 * @param {any} t ticket local (chave, spec?, documento?, ...)
 * @param {{ j?: any, banco?: { conexao?: string, ambiente?: string }, repos?: { caminho: string, camada: string, branchPrincipal?: string }[], git?: (cwd: string, args: string[]) => string }} [o]
 *   j: ticket normalizado (jira.buscar / documento.buscarSync), para medir descrição e comentários e para as chaves das subtarefas.
 *   git: leitura de git (testes trocam); o padrão roda `git -C`.
 */
function montar(t, o = {}) {
  const dirImpl = subpasta(t, 'impl'), dirInc = subpasta(t, 'incidentes'), dirQa = subpasta(t, 'qa');
  /** @type {{ alvo: Item[], pronto: Item[], onde: Item[] }} */
  const eixos = { alvo: [], pronto: [], onde: [] };
  /** @type {string[]} */ const lacunas = [];
  const fontes = {};
  const marca = (id, v) => { fontes[id] = v; };

  // Ticket: descrição, comentários e documento anexado
  const { caracteres, doc, temDoc, suficiente } = sobreTicket(t, o.j);
  marca('ticket', { texto: caracteres, documento: temDoc, comentarios: (o.j?.comentarios || []).length });
  if (suficiente) {
    eixos.alvo.push({ fonte: 'ticket', rotulo: temDoc ? 'Documento do ticket' : 'Descrição e comentários do ticket', confianca: 'bruto',
      detalhe: temDoc ? path.basename(doc) : `${caracteres} caracteres`, ...(temDoc ? { arquivo: doc } : {}) });
  } else lacunas.push('O ticket não tem descrição nem documento suficientes: só o título.');

  // Briefing do dev (explicado de boca)
  const briefing = path.join(dirImpl, BRIEFING);
  if (existe(briefing)) { eixos.alvo.push({ fonte: 'briefing', rotulo: 'Explicação do dev (verbal)', confianca: 'verbal', arquivo: briefing }); marca('briefing', true); }

  // Spec do Refinamento
  const est = estadoSpec(t), passos = est?.passos || [];
  const aprovado = (n) => passos.find((p) => p.n === n)?.status === 'aprovado';
  const arq = (nome) => { const d = dirSpec(t); const f = d && path.join(d, nome); return f && existe(f) ? f : undefined; };
  const cards = tarefasDe(tickets.pasta(t.chave));
  const aprovadas = cards.filter((c) => c.status === 'aprovada' && c.tipo !== 'qa');
  marca('spec', { passos: passos.map((p) => ({ n: p.n, status: p.status })), cards: cards.length, aprovadas: aprovadas.length });
  if (arq('spec.md')) {
    const ok = aprovado(2) || aprovado(1);
    eixos.alvo.push({ fonte: 'spec', rotulo: 'Spec do Refinamento', confianca: ok ? 'aprovado' : 'gerado', arquivo: arq('spec.md'), detalhe: ok ? 'aprovada' : 'ainda não aprovada' });
    eixos.pronto.push({ fonte: 'spec', rotulo: 'Critérios de aceite dos RFs (Dado/Quando/Então)', confianca: ok ? 'aprovado' : 'gerado', arquivo: arq('spec.md') });
  }
  if (arq('plan.md')) eixos.onde.push({ fonte: 'plan', rotulo: 'Plano técnico (mapeamento do código)', confianca: aprovado(3) ? 'aprovado' : 'gerado', arquivo: arq('plan.md') });
  if (arq('tasks.md') || cards.length) eixos.onde.push({ fonte: 'tarefas', rotulo: `Tarefas (${aprovadas.length}/${cards.filter((c) => c.tipo !== 'qa').length} aprovadas)`,
    confianca: aprovado(4) || aprovadas.length ? 'aprovado' : 'gerado', ...(arq('tasks.md') ? { arquivo: arq('tasks.md') } : {}) });
  if (arq('testes.md')) eixos.pronto.push({ fonte: 'testes', rotulo: 'Plano de testes do Refinamento (CTs)', confianca: aprovado(6) ? 'aprovado' : 'gerado', arquivo: arq('testes.md') });
  for (const lado of ['backend', 'mobile']) {
    const f = arqHandoff(t, lado);
    if (f && existe(f)) eixos.onde.push({ fonte: `mapa-${lado}`, rotulo: `Mapa do código (${lado})`, confianca: 'gerado', arquivo: f });
  }

  // Incidente (Mergulho)
  const diag = path.join(dirInc, '4-diagnostico.md'), mg = ler(path.join(dirInc, '.mergulho.json'), {});
  const repro = ler(path.join(dirInc, 'reproducao.json'), null), fluxo = ler(path.join(dirInc, 'fluxo.json'), null);
  const diagOk = existe(diag);
  marca('incidente', { diagnostico: diagOk, reproduziu: repro?.ok === true, passos: (fluxo?.passos || []).length, resumo: existe(path.join(dirInc, 'resumo.md')),
    massaReal: existe(path.join(dirInc, 'massa-real.sql')), massaTeste: existe(path.join(dirInc, 'massa-teste.sql')) });
  if (diagOk) eixos.alvo.push({ fonte: 'incidente', rotulo: 'Diagnóstico do incidente (ação/falha, evidências, certeza)', confianca: mg.etapa > 4 ? 'aprovado' : 'gerado', arquivo: diag });
  if (repro?.ok === true) eixos.pronto.push({ fonte: 'reproducao', rotulo: 'Reprodução do incidente (o teste de regressão)', confianca: 'gerado', arquivo: path.join(dirInc, 'reproducao.json') });
  else if ((fluxo?.passos || []).length) eixos.pronto.push({ fonte: 'fluxo', rotulo: `Fluxo de reprodução (${fluxo.passos.length} passos, ${repro?.ok === false ? 'não reproduziu' : 'sem resultado'})`, confianca: 'gerado', arquivo: path.join(dirInc, 'fluxo.json') });

  // QA
  const cen = ler(path.join(dirQa, '.cenarios.json'), null), qa = ler(path.join(dirQa, '.qa.json'), {});
  const lista = (cen?.cenarios || []).filter((c) => !c.arquivado && c.status !== 'dispensado');
  marca('qa', { cenarios: lista.length, aprovado: qa.fase === 'plano_aprovado' });
  if (lista.length) eixos.pronto.push({ fonte: 'qa', rotulo: `Cenários do QA (${lista.length})`, confianca: qa.fase === 'plano_aprovado' ? 'aprovado' : 'gerado', arquivo: path.join(dirQa, '.cenarios.json') });

  // Trabalho já feito por alguém: branches e commits com a chave do ticket (ou das subtarefas) nos repositórios configurados
  const chaves = [...new Set([t.chave, ...(o.j?.subtarefas || []).map((x) => x.key)].filter(Boolean))];
  let trabalho = [];
  try { trabalho = trabalhoExistente(o.repos || [], chaves, o.git); } catch { /* repositório ilegível: segue sem */ }
  marca('trabalho', { repositorios: trabalho.length, branches: trabalho.reduce((n, x) => n + x.branches.length, 0), chaves });
  if (trabalho.length) {
    const nB = trabalho.reduce((n, x) => n + x.branches.length, 0), nC = trabalho.reduce((n, x) => n + x.foraDeBranch.length + x.integrados.length, 0);
    eixos.onde.push({ fonte: 'trabalho', rotulo: 'Trabalho já feito (branches e commits do ticket)', confianca: 'bruto', arquivo: path.join(dirImpl, TRABALHO),
      detalhe: `${nB} branch(es), ${nC} commit(s) fora de branch com a chave` });
    lacunas.push(`Já existe trabalho neste ticket nos repositórios (${nB} branch(es), ${nC} commit(s) soltos ou integrados): leia ${TRABALHO} antes de planejar.`);
  }

  // Níveis, prontidão e modo
  const niveis = { alvo: nivelDe(eixos.alvo), pronto: nivelDe(eixos.pronto), onde: nivelDe(eixos.onde) };
  const prontidao = rank(niveis.alvo) >= rank('gerado') && rank(niveis.pronto) >= rank('gerado') ? 'alta' : rank(niveis.alvo) >= rank('bruto') ? 'media' : 'baixa';
  const modo = niveis.alvo === 'aprovado' && (aprovado(4) || aprovadas.length) ? 'executar'
    : diagOk ? 'corrigir' : rank(niveis.alvo) >= rank('verbal') ? 'entender' : 'perguntar';
  if (niveis.pronto === 'ausente') lacunas.push('Sem critério de pronto: nenhuma spec, cenário de QA ou reprodução. O Entendimento vai propor um e você aprova.');
  if (niveis.onde === 'ausente') lacunas.push('Sem indicação de onde mexer: a Varredura vai mapear o código do zero.');

  // Capacidades
  const { banco, repos, semBranch } = capacidadesDe(o, lacunas);

  return {
    versao: 1, ticket: t.chave, titulo: t.titulo || t.documento?.nome || '', gerado: new Date().toISOString(),
    eixos, niveis, fontes, prontidao, modo, lacunas, trabalho, capacidades: { banco, repos, semBranch },
    ...(() => { const cat = tipoTicket.categoriaDe({ ...t, tipo: o.j?.tipo || t.tipo });
      return { tipoTicket: String(o.j?.tipo || t.tipo || ''), categoria: cat, exigeReproducao: tipoTicket.exigeReproducao(cat) }; })(),
    exigeAprovacaoEntendimento: modo !== 'executar' && prontidao !== 'alta'
  };
}

module.exports = { montar };
