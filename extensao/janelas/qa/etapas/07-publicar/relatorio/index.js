// @ts-check
// Relatório do QA (Etapa 7): a extensão monta os dados (dados.js, sem IA); a IA escreve o texto (prompt.js) e sugere o nível;
// você confere e publica. Sem IA (erro, tempo), publica a versão base (mdBase), que já tem procedência e resultado por cenário.
//   registrarRelatorio  o qa-state relatorio grava o texto (a IA não escreve em ~/.claude) e confere os arquivos citados
//   compor              o Markdown final: nível no topo (o da regra, o da IA ou o seu, com motivo) + o texto
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { claude } = require('../../../orquestrador/claude');
const { lerSid } = require('../../../orquestrador/sid');
const { NIVEIS, veredito } = require('../veredito');
const { cenarios } = require('../../02-cenarios/mapa');
const { DADOS, montarDados, mdBase, lerDados } = require('./dados');
const { promptRelatorio } = require('./prompt');

const RELATORIO = 'relatorio-qa.md';

/** qa-state relatorio: grava o texto e o nível sugerido. @returns {string[]} arquivos citados que não existem */
function registrarRelatorio(dir, arq, { nivel, porque = '', divergencias = 0 }) {
  if (!NIVEIS[nivel] || nivel === 'nao-concluido')
    throw new Error('--nivel precisa ser aprovado, aprovado-com-ressalvas ou reprovado');
  const texto = fs.readFileSync(arq, 'utf8');
  const existentes = new Set((lerDados(dir)?.cenarios || []).flatMap((c) => c.arquivos));
  const citados = [...texto.matchAll(/`([^`\s]+\.(?:png|jpe?g|mp4|webm|txt|xml|json|log))`/gi)].map((m) =>
    path.basename(m[1])
  );
  const faltam = [...new Set(citados.filter((f) => !existentes.has(f)))];
  fs.writeFileSync(path.join(dir, RELATORIO), texto);
  mudar(dir, {
    relatorio: {
      em: new Date().toISOString(),
      nivelIA: nivel,
      porque: String(porque).trim(),
      divergencias: Number(divergencias) || 0
    }
  });
  return faltam;
}

// Relatório desatualizado: algum cenário terminou depois dele.
function atual(dir) {
  const rel = estado(dir).relatorio;
  if (!rel || !fs.existsSync(path.join(dir, RELATORIO))) return false;
  const fins = cenarios(dir)
    .cenarios.flatMap((c) => (c.execucoes || []).map((x) => x.fim || ''))
    .sort();
  return (fins.at(-1) || '') <= rel.em;
}

/** @returns {Promise<{ ok: boolean, semIA?: boolean, erro?: string }>} */
async function gerarRelatorio(dir, d) {
  const dados = montarDados(dir, d);
  if (!dados.veredito.publicavel)
    return { ok: false, erro: `execução não concluída (${dados.veredito.motivos.join('; ')})` };
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto }),
    sid = estado(dir).gerarSid;
  vivo('etapa', 'QA · 7. Relatório');
  mudar(dir, { etapa: 'relatorio', relatorio: null });
  let r;
  try {
    r = await claude(
      dir,
      {
        prompt: promptRelatorio(d.chave, dir, path.join(dir, DADOS), dados.veredito),
        titulo: 'QA · Escrevendo o relatório',
        cwd: dados.procedencia.backend || d.backend,
        ...(sid ? { sessao: sid } : {})
      },
      d
    );
  } finally {
    mudar(dir, { etapa: null });
  }
  if (sid) mudar(dir, { gerarSid: lerSid(dir) || sid });
  if (estado(dir).relatorio) {
    vivo('fim', 'Relatório escrito: confira o nível e publique');
    return { ok: true };
  }
  // sem IA: a versão base já é publicável
  fs.writeFileSync(path.join(dir, RELATORIO), mdBase(montarDados(dir, d)));
  mudar(dir, { relatorio: { em: new Date().toISOString(), nivelIA: null, porque: '', divergencias: 0, semIA: true } });
  vivo(
    'aviso',
    `A IA não escreveu o relatório (${r.erro || (r.estourou ? 'tempo' : 'sem registro')}): fica a versão base, sem IA`
  );
  return { ok: true, semIA: true };
}

/** O nível que vale: o seu (com motivo) > o da IA > o da regra. */
function nivelFinal(dir) {
  const rel = estado(dir).relatorio || {},
    v = veredito(cenarios(dir).cenarios, { divergencias: rel.divergencias || 0 });
  const nivel = rel.nivelHumano || rel.nivelIA || v.nivel;
  return {
    nivel,
    rotulo: NIVEIS[nivel],
    regra: v,
    porque: rel.motivoHumano || rel.porque || v.motivos.join('; '),
    humano: !!rel.nivelHumano
  };
}

function compor(dir) {
  const n = nivelFinal(dir),
    texto = fs.readFileSync(path.join(dir, RELATORIO), 'utf8');
  const cabeca = [
    `**Nível: ${n.rotulo}**${n.porque ? ` · ${n.porque}` : ''}`,
    n.nivel !== n.regra.nivel
      ? `_Pela regra seria ${n.regra.rotulo}${n.humano ? '; nível definido pelo QA' : ''}._`
      : ''
  ].filter(Boolean);
  return `${cabeca.join('\n\n')}\n\n${texto.trim()}\n`;
}

module.exports = { RELATORIO, registrarRelatorio, gerarRelatorio, atual, nivelFinal, compor };
