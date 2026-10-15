// @ts-check
// Dossiê da Implementação: o que existe no disco do ticket (spec, cards, incidente, QA, descrição, briefing do dev) normalizado em três
// eixos (alvo, pronto, onde) com a confiança de cada fonte. Daí saem a prontidão e o modo da esteira (esteira.js). Só lê arquivos:
// sem vscode e sem IA, então roda em teste e em bin/. Gravado em impl/dossie.json (máquina) e impl/dossie.md (IA e aba Dossiê).
//   confiança: aprovado (humano aprovou) > gerado (IA produziu) > bruto (texto do ticket) > verbal (o dev explicou) > ausente
//   modo: executar (spec e tarefas aprovadas) · corrigir (diagnóstico do incidente) · entender (texto sem refino) · perguntar (nada)
const fs = require('fs');
const path = require('path');
const tickets = require('../infra/tickets');
const { dirSpec, estadoSpec, tarefasDe, arqHandoff, ler } = require('../refinamento/locais');
const { html2txt } = require('../infra/texto');

const NIVEIS = ['ausente', 'verbal', 'bruto', 'gerado', 'aprovado'];
const rank = (n) => NIVEIS.indexOf(n);
const BRIEFING = '.briefing.md', JSON_ = 'dossie.json', MD = 'dossie.md', LIMIAR_TEXTO = 40; // caracteres de descrição+comentários para virar "bruto"
const existe = (f) => { try { return fs.statSync(f).size > 0; } catch { return false; } };
const subpasta = (t, lista) => tickets.pasta(t.chave, lista);

/**
 * O que o ticket traz além do título: descrição + comentários (caracteres) e o documento anexado. Usado pelo dossiê e pela entrada do
 * Refinamento (refinamento/spec.js): ticket que só tem título vira pergunta ao dev, nunca invenção.
 * @param {any} t ticket local (chave, documento?)  @param {any} [j] ticket normalizado (jira.buscar / documento.buscarSync)
 */
function sobreTicket(t, j) {
  const texto = html2txt(j?.descricao) + (j?.comentarios || []).map((c) => html2txt(c.corpo)).join('\n');
  const doc = t.documento?.arquivo ? path.join(tickets.pasta(t.chave), t.documento.arquivo) : null;
  const temDoc = !!doc && fs.existsSync(doc);
  const caracteres = texto.trim().length;
  return { caracteres, doc, temDoc, suficiente: caracteres >= LIMIAR_TEXTO || temDoc };
}

/** Maior nível entre as fontes de um eixo. */
const nivelDe = (itens) => itens.reduce((m, i) => (rank(i.confianca) > rank(m) ? i.confianca : m), 'ausente');

/** @typedef {{ fonte: string, rotulo: string, confianca: string, arquivo?: string, detalhe?: string }} Item */

/**
 * @param {any} t ticket local (chave, spec?, documento?, ...)
 * @param {{ j?: any, banco?: { conexao?: string, ambiente?: string }, repos?: { caminho: string, camada: string, branchPrincipal?: string }[] }} [o]
 *   j: ticket normalizado (jira.buscar / documento.buscarSync), só para medir descrição e comentários.
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

  // Níveis, prontidão e modo
  const niveis = { alvo: nivelDe(eixos.alvo), pronto: nivelDe(eixos.pronto), onde: nivelDe(eixos.onde) };
  const prontidao = rank(niveis.alvo) >= rank('gerado') && rank(niveis.pronto) >= rank('gerado') ? 'alta' : rank(niveis.alvo) >= rank('bruto') ? 'media' : 'baixa';
  const modo = niveis.alvo === 'aprovado' && (aprovado(4) || aprovadas.length) ? 'executar'
    : diagOk ? 'corrigir' : rank(niveis.alvo) >= rank('verbal') ? 'entender' : 'perguntar';
  if (niveis.pronto === 'ausente') lacunas.push('Sem critério de pronto: nenhuma spec, cenário de QA ou reprodução. O Entendimento vai propor um e você aprova.');
  if (niveis.onde === 'ausente') lacunas.push('Sem indicação de onde mexer: a Varredura vai mapear o código do zero.');

  // Capacidades
  const b = o.banco || {};
  const banco = b.conexao && b.ambiente && b.ambiente !== 'producao' ? 'leitura' : 'nenhum';
  const repos = (o.repos || []).map((r) => ({ caminho: r.caminho, camada: r.camada, branchPrincipal: r.branchPrincipal || '' }));
  const semBranch = repos.filter((r) => !r.branchPrincipal).map((r) => r.caminho);
  if (!repos.length) lacunas.push('Nenhum repositório de código configurado (Configurações > Geral > Repositórios de código).');
  else if (semBranch.length) lacunas.push(`Sem branch principal configurada: ${semBranch.map((c) => path.basename(c)).join(', ')} (Configurações > Geral > Repositórios de código).`);
  if (banco === 'nenhum') lacunas.push('Sem acesso ao banco (não configurado ou em produção): dados confirmados ficam como pendência.');

  return {
    versao: 1, ticket: t.chave, titulo: t.titulo || t.documento?.nome || '', gerado: new Date().toISOString(),
    eixos, niveis, fontes, prontidao, modo, lacunas, capacidades: { banco, repos, semBranch },
    exigeAprovacaoEntendimento: modo !== 'executar' && prontidao !== 'alta'
  };
}

const ROTULO_MODO = { executar: 'Executar (spec e tarefas aprovadas)', corrigir: 'Corrigir (incidente diagnosticado)', entender: 'Entender primeiro (sem refinamento)', perguntar: 'Perguntar (só o título)' };
const ROTULO_EIXO = { alvo: 'Alvo: o que tem que mudar', pronto: 'Critério de pronto: como saber que acabou', onde: 'Onde mexer' };

/** Markdown do dossiê (a IA e a aba Dossiê leem daqui). */
function paraMarkdown(d) {
  const sec = (e) => `## ${ROTULO_EIXO[e]} · ${d.niveis[e]}\n\n` + (d.eixos[e].length
    ? d.eixos[e].map((i) => `- **${i.rotulo}** (${i.confianca})${i.detalhe ? ` · ${i.detalhe}` : ''}${i.arquivo ? `\n  ${i.arquivo}` : ''}`).join('\n') : '- (nada encontrado)');
  return [`# Dossiê · ${d.ticket}${d.titulo ? ` · ${d.titulo}` : ''}`, '',
    `Modo: **${ROTULO_MODO[d.modo]}** · Prontidão: **${d.prontidao}**`, '',
    sec('alvo'), '', sec('pronto'), '', sec('onde'), '',
    '## Capacidades', '', `- Banco: ${d.capacidades.banco === 'leitura' ? 'somente leitura (mapa-db)' : 'indisponível'}`,
    ...d.capacidades.repos.map((r) => `- Repositório ${r.camada}: ${r.caminho} · branch principal: ${r.branchPrincipal || '(não configurada)'}`), '',
    '## Lacunas', '', ...(d.lacunas.length ? d.lacunas.map((l) => `- ${l}`) : ['- (nenhuma)']), ''].join('\n');
}

/** Grava dossie.json e dossie.md em <dir>. */
function gravar(dir, d) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, JSON_), JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(dir, MD), paraMarkdown(d));
}
const lerGravado = (dir) => ler(path.join(dir, JSON_), null);

module.exports = { montar, sobreTicket, paraMarkdown, gravar, lerGravado, nivelDe, NIVEIS, ROTULO_MODO, BRIEFING, JSON_, MD, _teste: { rank } };
