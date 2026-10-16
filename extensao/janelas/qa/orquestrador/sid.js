// @ts-check
// Id da última sessão do claude -p desta pasta (gravado pelo maestro no .ao-vivo.sid): é o que o --resume continua.
const fs = require('fs');
const path = require('path');
const { SID } = require('../../../infra/agentes/maestro/estado');

const lerSid = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, SID), 'utf8').trim() || null;
  } catch {
    return null;
  }
};

module.exports = { lerSid };
