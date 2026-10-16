// @ts-check
// Estado do QA na pasta qa/ do ticket (.qa.json) e a leitura/gravação de JSON que todo o módulo usa.
const fs = require('fs');
const path = require('path');

// { fase: procurando | sem_plano | criando | erro | plano_encontrado (espera aprovação) | alterando | plano_aprovado, execucao: rodando | pausado | parado }
const ESTADO = '.qa.json';
const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return padrao;
  }
};
// Atômico (tmp + rename): o qa-state do Claude e a extensão gravam os mesmos arquivos de processos diferentes e ninguém pode ler um arquivo pela metade.
const gravarJson = (arq, v) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(`${arq}.${process.pid}.tmp`, JSON.stringify(v, null, 2));
  fs.renameSync(`${arq}.${process.pid}.tmp`, arq);
};
const estado = (dir) => lerJson(path.join(dir, ESTADO), {});
const mudar = (dir, e) => gravarJson(path.join(dir, ESTADO), { ...estado(dir), ...e, em: new Date().toISOString() });

module.exports = { ESTADO, lerJson, gravarJson, estado, mudar };
