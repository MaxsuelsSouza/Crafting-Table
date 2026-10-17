// @ts-check
// Evidências no Android: vídeo pelo screenrecord da seção Evidências (modulos/evidencias.js, agora com o serial do aparelho)
// e os PNGs que o Maestro grava na pasta da execução (--test-output-dir). Usado por emulador/ e aparelho/.
const { arquivos } = require('../aplicacao/arquivos');

/** serialDe(o) → serial do aparelho a gravar ('' = não grava). o: { chave, sid?, serial? }. */
const evidencia = (serialDe) => ({
  gravar(destino, o = {}) {
    const serial = serialDe(o);
    if (serial) require('../../../modulos/evidencias').gravar?.({ destino, sid: o.sid, chave: o.chave, continuo: true, serial });
  },
  parar: () => require('../../../modulos/evidencias').pararGravacao?.(),
  arquivos: (pasta) => arquivos(pasta)
});

module.exports = { evidencia };
