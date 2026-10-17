// @ts-check
// HEAD original dos repositórios durante a reprodução: a 1.4 destaca o commit da ref e guarda o HEAD de antes em .esteira.json
// (repro.head = { <caminho>: <branch ou sha> }); a 1.6 (e a retomada, se a etapa caiu no meio) restaura e apaga o registro.
// Só guarda o PRIMEIRO HEAD de cada repositório: numa retomada, o HEAD atual já é o commit destacado.
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const git = require('../../../../../infra/git');
const { estado, mudar } = require('../../../estado');

const repro = (dir) => estado(dir).repro || {};

/** Guarda o HEAD de antes deste repositório (se ainda não estava guardado). */
const guardar = (dir, caminho, de) => {
  const r = repro(dir);
  if (r.head?.[caminho]) return;
  mudar(dir, { repro: { ...r, head: { ...(r.head || {}), [caminho]: de } } });
};

/** Volta cada repositório ao HEAD guardado. O que falhar fica guardado (tenta de novo na próxima) e vira aviso no Ao vivo. */
function restaurar(dir) {
  const r = repro(dir),
    falhas = {};
  for (const [caminho, head] of Object.entries(r.head || {})) {
    const v = git.voltar({ caminho }, head);
    if (v.ok) aoVivo.anotar(dir, { tipo: 'acao', texto: `${path.basename(caminho)}: de volta a ${head}` });
    else {
      falhas[caminho] = head;
      aoVivo.anotar(dir, {
        tipo: 'erro',
        texto: `Não consegui voltar ${path.basename(caminho)} para ${head}: ${v.texto}`
      });
    }
  }
  if (r.head) mudar(dir, { repro: { ...repro(dir), head: Object.keys(falhas).length ? falhas : undefined } });
  return !Object.keys(falhas).length;
}

module.exports = { guardar, restaurar };
