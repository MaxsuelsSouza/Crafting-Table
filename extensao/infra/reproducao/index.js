// @ts-check
// Reprodução de bug/incidente (o que é comum aos módulos, sem vscode): confirmar o cenário antes de corrigir.
// Como usar: const reproducao = require('<…>/infra/reproducao'); reproducao.veredito({ passos, roteiro, ambiente, midia }).
//   artefatos-prompt.js  prompt de extração dos artefatos (Massa de dados, Comportamento relatado, Não analisado): Incidentes 2 e Implementações 1.2
//   quadros-video.js     quadros dos vídeos de evidência pelo ffmpeg (Implementações 1.2)
//   veredito.js          REPRODUZIDO · SEM_EVIDENCIA · INCONCLUSIVO · NAO_REPRODUZIDO (Implementações 1.6)
//   teste-reproducao.js  node infra/reproducao/teste-reproducao.js
const artefatos = require('./artefatos-prompt');
const { extrair, PASTA: QUADROS, VIDEO } = require('./quadros-video');
const { veredito, VEREDITOS, ROTULO } = require('./veredito');

module.exports = { artefatos, extrairQuadros: extrair, QUADROS, VIDEO, veredito, VEREDITOS, ROTULO };
