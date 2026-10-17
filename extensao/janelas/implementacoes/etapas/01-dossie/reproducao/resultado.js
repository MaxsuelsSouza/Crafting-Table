// @ts-check
// Resultado da Reprodução: os cenários do fluxo (fluxo.json, componentes/fluxo-passos.js), o que falhou ("falhou" = o erro aconteceu), a prova de
// cada cenário (print E vídeo na pasta da execução) e o reproducao.md que a extensão grava para o Entendimento e o QA lerem.
const fs = require('fs');
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { REPRODUCAO } = require('../../../../../infra/dossie/arquivos');
const { VIDEO, ROTULO } = require('../../../../../infra/reproducao');
const { evidenciasDoTicket } = require('./evidencias-ticket');

const IMG = /\.(png|jpe?g|gif|webp)$/i;
// Prova da última execução do cenário: tem print? tem vídeo?
const provas = (dir, p) => {
  const arqs = p.execucoes?.length ? fluxo.arquivosDe(dir, p.execucoes.at(-1)) : [];
  return { print: arqs.some((f) => IMG.test(f)), video: arqs.some((f) => VIDEO.test(f)) };
};
const comEvidencia = (dir, p) => {
  const x = provas(dir, p);
  return x.print && x.video;
};
/** @returns {{ passos: any[], falhou: any[], semEvidencia: any[], pendentes: any[], confirmou: boolean }} */
function resultado(dir) {
  const passos = fluxo.ler(dir).passos,
    falhou = passos.filter((p) => p.status === 'falhou');
  return {
    passos,
    falhou,
    semEvidencia: falhou.filter((p) => !comEvidencia(dir, p)),
    pendentes: passos.filter((p) => ['pendente', 'executando'].includes(p.status)),
    confirmou: falhou.length > 0
  };
}
/**
 * reproducao.md: veredito, ref/commit, ambiente, cenários e arquivos de evidência.
 * @param {string} dir @param {string} chave @param {string} [aceitaSem] por que seguiu sem confirmar
 * @param {{ veredito?: string, motivo?: string, refs?: Record<string, { ref: string, commit: string, motivo?: string }>, ambiente?: string }} [info] estado.repro
 */
function gravarResumo(dir, chave, aceitaSem = '', info = {}) {
  const r = resultado(dir),
    rel = (f) => path.relative(dir, f);
  const evTicket = evidenciasDoTicket(dir);
  const linhas = [
    `# Reprodução · ${chave}`,
    '',
    ...(info.veredito
      ? [`**Veredito: ${ROTULO[info.veredito] || info.veredito}**${info.motivo ? ` · ${info.motivo}` : ''}`, '']
      : []),
    r.confirmou && !r.semEvidencia.length
      ? `**Erro confirmado**: ${r.falhou.length} cenário(s) falharam (o comportamento relatado aconteceu).`
      : `**Erro não confirmado**${aceitaSem ? `: ${aceitaSem}` : ' pela reprodução.'}`,
    '',
    ...Object.entries(info.refs || {}).map(
      ([repo, x]) =>
        `- Código: ${path.basename(repo)} em \`${x.ref}\` (commit ${String(x.commit).slice(0, 10)})${x.motivo ? `: ${x.motivo}` : ''}`
    ),
    ...(info.ambiente ? [`- Ambiente: ${info.ambiente}`] : []),
    '',
    '## Cenários',
    ''
  ];
  for (const p of r.passos) {
    const ex = p.execucoes.at(-1),
      arqs = ex ? fluxo.arquivosDe(dir, ex).map(rel) : [];
    linhas.push(
      `- **${p.id}** [${p.status}] ${p.titulo}${ex?.nota ? ` · ${ex.nota}` : ''}${p.fonte ? ` (fonte: ${p.fonte})` : ''}`,
      ...arqs.map((a) => `  - evidência: ${a}`)
    );
  }
  if (!r.passos.length) linhas.push('- (nenhum cenário registrado)');
  if (evTicket.length)
    linhas.push(
      '',
      '## Evidências já presentes no ticket (ticket, pai ou irmãos)',
      '',
      ...evTicket.map((e) => `- ${e.arquivo}${e.de ? ` (de ${e.de})` : ''}`)
    );
  linhas.push('');
  fs.writeFileSync(path.join(dir, REPRODUCAO), linhas.join('\n'));
}
/** Guarda o fluxo anterior para replanejar do zero (as evidências dos cenários ficam em evidencias/; o vídeo da sessão anterior sai). */
function reiniciar(dir) {
  const f = path.join(dir, fluxo.ARQ);
  fs.rmSync(path.join(dir, 'evidencias', 'sessao'), { recursive: true, force: true });
  if (fs.existsSync(f))
    fs.renameSync(
      f,
      path.join(dir, `fluxo.${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}.json`)
    );
}

module.exports = { provas, comEvidencia, resultado, gravarResumo, reiniciar };
