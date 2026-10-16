// @ts-check
// Estado do Mergulho em <aba>/.mergulho.json (etapa, fase, pausa, aprovacao, obsPO, sub, host) e os arquivos de controle da pasta da aba.
// Comum a todas as etapas e à aba Mergulho. Contrato dos artefatos: incidentes/CONTRATO.md.
const fs = require('fs');
const path = require('path');
const maestro = require('../painel/maestro');
const { ETAPAS } = require('./etapas');

const ESTADO = '.mergulho.json',
  PAUSA = '.pausa.json',
  RESPOSTAS = '.respostas.md',
  CONTEXTO = '.jira-contexto.md';
// Opções das pausas que a extensão resolve sozinha (branch, sync, massa real, ticket).
const OPCOES = {
  TROCAR: 'Trocar para a branch correta e continuar',
  SEGUIR: 'Continuar assim mesmo',
  TENTAR: 'Tentar de novo',
  SEM_MASSA: 'Continuar sem a massa real'
};

const lerJson = (arq, vazio) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return vazio;
  }
};
const lerTxt = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

const estado = (dir) => ({ etapa: 1, fase: 'parado', pausa: null, obsPO: '', ...lerJson(path.join(dir, ESTADO), {}) });
const gravar = (dir, base, patch) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ESTADO),
    JSON.stringify(
      {
        ...base,
        ...patch,
        ...(patch.fase === 'rodando' ? { host: process.pid } : {}),
        atualizado: new Date().toISOString()
      },
      null,
      2
    )
  );
};
const mudar = (dir, patch) => gravar(dir, estado(dir), patch);
// Mescla sem completar com os padrões (etapa 5: não reescreve etapa/fase que não mandou).
const mesclar = (dir, patch) => gravar(dir, lerJson(path.join(dir, ESTADO), {}), patch);

// Situação única da tela (aba, cabeçalho e Ao vivo leem daqui, então nunca discordam): "rodando" no arquivo só vale com o Claude vivo ou com a
// janela dona (host) viva; senão a execução foi interrompida (janela recarregada/fechada) e conta como parada.
const vivoPid = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const situacao = (dir) => {
  const e = estado(dir),
    rodando = maestro.rodando(dir) || (e.fase === 'rodando' && vivoPid(e.host));
  return { e, rodando, fase: e.fase === 'rodando' && !rodando ? 'parado' : e.fase };
};
// Artefato da etapa n gravado (vazio conta como não gravado).
const existe = (dir, n) => {
  try {
    return fs.statSync(path.join(dir, ETAPAS[n - 1].arq)).size > 0;
  } catch {
    return false;
  }
};

module.exports = {
  ESTADO,
  PAUSA,
  RESPOSTAS,
  CONTEXTO,
  OPCOES,
  lerJson,
  lerTxt,
  estado,
  mudar,
  mesclar,
  situacao,
  existe
};
