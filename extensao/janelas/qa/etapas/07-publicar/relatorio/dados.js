// @ts-check
// Dados do relatório, montados pela extensão sem IA (relatorio-dados.json): procedência, nível, e por cenário o que o plano pede,
// a camada, a massa (e se foi manipulada), o que a jornada fez, o resultado, os avisos e os arquivos de evidência.
// A IA só escreve o texto em cima disto (prompt.js); sem IA, mdBase() já publica uma versão completa.
const fs = require('fs');
const path = require('path');
const { lerJson, gravarJson, estado } = require('../../../estado');
const { cenarios } = require('../../02-cenarios/mapa');
const { ambiente } = require('../../03-ambiente/estado');
const { massa } = require('../../05-massa/estado');
const { LOG_SQL } = require('../../05-massa/proposta');
const { camadaDe } = require('../../06-execucao/regras/camadas');
const { arquivosDe } = require('../../06-execucao/evidencias');
const { veredito, nivelCenario, ROTULO_CENARIO } = require('../veredito');
const { executor } = require('./dependencias');

const DADOS = 'relatorio-dados.json';
const ler = (f, max = 4000) => {
  try {
    return fs.readFileSync(f, 'utf8').slice(0, max);
  } catch {
    return '';
  }
};
const sqlFeito = (dir) =>
  ler(path.join(dir, LOG_SQL), 200000)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((x) => x && x.ok && ['aplicar', 'desfazer'].includes(x.tipo));

function montarDados(dir, d = {}) {
  const r = cenarios(dir),
    e = estado(dir),
    amb = ambiente(dir) || {},
    m = massa(dir),
    todasMassas = [...m.itens, ...(m.mortas || [])];
  const ativos = r.cenarios.filter((c) => !c.arquivado);
  const lista = ativos.map((c) => {
    const ex = c.execucoes?.at(-1) || {},
      pasta = typeof ex.evidencias === 'string' ? path.join(dir, ex.evidencias) : '';
    return {
      id: c.id,
      titulo: c.titulo,
      plano: c.texto,
      camada: camadaDe(dir, c.id),
      nivel: nivelCenario(c),
      resultado: ROTULO_CENARIO[nivelCenario(c)],
      nota: ex.nota || '',
      avisos: ex.avisos || [],
      inicio: ex.inicio || null,
      fim: ex.fim || null,
      tentativas: (c.execucoes || []).length,
      jornada: pasta ? ler(path.join(pasta, 'jornada.txt')) : '',
      evidencias: pasta,
      arquivos: pasta ? arquivosDe(dir, ex).map((f) => path.basename(f)) : [],
      massa: todasMassas
        .filter((i) => (i.cenarios || []).includes(c.id))
        .map((i) => ({
          id: i.id,
          papel: i.papel,
          dados: i.dados,
          manipulada: i.origem === 'sql',
          desfazer: i.desfazer || [],
          estado: i.estado
        }))
    };
  });
  const inicios = lista
      .map((c) => c.inicio)
      .filter(Boolean)
      .sort(),
    fins = lista
      .map((c) => c.fim)
      .filter(Boolean)
      .sort();
  const dados = {
    chave: d.chave || e.chave,
    plano: { subtarefa: e.subtarefa || '', versao: r.planoVersao, cenarios: lista.length },
    procedencia: {
      backend: amb.backend || '',
      mobile: amb.mobile || '',
      sha: amb.sha || {},
      app: amb.app || '',
      banco: d.banco ? `${d.banco.conexao} (${d.banco.ambiente === 'qas' ? 'QAS' : 'cópia de produção'})` : '',
      executor: executor(amb.backend),
      inicio: inicios[0] || null,
      fim: fins.at(-1) || null
    },
    veredito: veredito(r.cenarios),
    cenarios: lista,
    escritasNoBanco: sqlFeito(dir).map((x) => ({
      tipo: x.tipo,
      em: x.em,
      sql: x.sql,
      desfazer: x.desfazer || [],
      cenarios: x.cenarios || []
    }))
  };
  gravarJson(path.join(dir, DADOS), dados);
  return dados;
}

// Versão sem IA (e a base que a IA enriquece): resumo, procedência e a tabela por cenário.
function mdBase(dados) {
  const p = dados.procedencia,
    cel = (s) =>
      String(s || '')
        .replace(/\|/g, '/')
        .replace(/\n+/g, ' ');
  return [
    `## Execução do plano de testes — ${dados.chave}`,
    '',
    `Plano: **${dados.plano.subtarefa || dados.chave}** v${dados.plano.versao}, ${dados.plano.cenarios} cenário(s).`,
    '',
    '### Procedência',
    '',
    '| Item | Valor |',
    '|---|---|',
    `| Backend | ${cel(p.backend)} @ \`${cel(p.sha.backend || '?')}\` |`,
    `| Mobile | ${cel(p.mobile)} @ \`${cel(p.sha.mobile || '?')}\`; app \`${cel(p.app)}\` |`,
    `| Banco | ${cel(p.banco)} |`,
    `| Executado por | ${cel(p.executor)}, ${cel(p.inicio)} → ${cel(p.fim)} |`,
    '',
    '### Resumo',
    '',
    '| Cenário | Camada | Resultado | Observação |',
    '|---|---|---|---|',
    ...dados.cenarios.map(
      (c) =>
        `| ${c.id} · ${cel(c.titulo)} | ${cel(c.camada?.camada || '—')} | ${c.resultado} | ${cel([c.nota, ...c.avisos].filter(Boolean).join(' · '))} |`
    )
  ].join('\n');
}

const lerDados = (dir) => lerJson(path.join(dir, DADOS), null);

module.exports = { DADOS, montarDados, mdBase, lerDados };
