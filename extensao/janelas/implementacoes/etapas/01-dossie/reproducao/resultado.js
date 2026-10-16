// @ts-check
// Resultado da Reprodução: os cenários do fluxo (fluxo.json, componentes/fluxo-passos.js), o que falhou ("falhou" = o erro aconteceu) e o
// reproducao.md que a extensão grava para o Entendimento e o QA lerem.
const fs = require('fs');
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { REPRODUCAO } = require('../../../../../infra/dossie/arquivos');
const { evidenciasDoTicket } = require('./evidencias-ticket');

const comEvidencia = (dir, p) => p.execucoes.some((x) => fluxo.arquivosDe(dir, x).length > 0);
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
/** reproducao.md: cenários, o que falhou (o erro aconteceu) e os arquivos de evidência. */
function gravarResumo(dir, chave, aceitaSem = '') {
  const r = resultado(dir),
    rel = (f) => path.relative(dir, f);
  const evTicket = evidenciasDoTicket(dir);
  const linhas = [
    `# Reprodução · ${chave}`,
    '',
    r.confirmou
      ? `**Erro confirmado**: ${r.falhou.length} cenário(s) falharam (o comportamento relatado aconteceu).`
      : `**Erro não confirmado**${aceitaSem ? `: ${aceitaSem}` : ' pela reprodução.'}`,
    '',
    '## Cenários',
    ''
  ];
  for (const p of r.passos) {
    const ex = p.execucoes.at(-1),
      arqs = ex ? fluxo.arquivosDe(dir, ex).map(rel) : [];
    linhas.push(
      `- **${p.id}** [${p.status}] ${p.titulo}${ex?.nota ? ` · ${ex.nota}` : ''}`,
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
/** Guarda o fluxo anterior para replanejar do zero (as evidências ficam em evidencias/). */
function reiniciar(dir) {
  const f = path.join(dir, fluxo.ARQ);
  if (fs.existsSync(f))
    fs.renameSync(
      f,
      path.join(dir, `fluxo.${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}.json`)
    );
}

module.exports = { comEvidencia, resultado, gravarResumo, reiniciar };
