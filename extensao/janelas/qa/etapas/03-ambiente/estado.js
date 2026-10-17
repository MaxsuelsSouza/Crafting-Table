// @ts-check
const os = require('os');
const path = require('path');
const { lerJson, gravarJson } = require('../../estado');

// ── Ambiente (preparar-ambiente.py da skill testes-funcionais: config, refs, API 5111, Metro 8081, emulador, app). Idempotente:
// o que já está de pé é reaproveitado, então rodar a cada ▶ custa segundos. O app é recompilado no 1º preparo do dia.
// Um ambiente por máquina (portas e aparelho únicos): a trava diz de qual ticket ele está. .ambiente.json.nome: emulador, aparelho ou web.
const AMBIENTE = '.ambiente.json';
const TRAVA = () => path.join(os.homedir(), '.claude', 'tickets', '.qa-ambiente.json');
const donoAmbiente = () => lerJson(TRAVA(), null);
const travar = (chave) => gravarJson(TRAVA(), { chave, em: new Date().toISOString() });
const ambiente = (dir) => lerJson(path.join(dir, AMBIENTE), null);
const hoje = (d = new Date()) => d.toLocaleDateString('sv-SE');
const preparos = new Map(); // dir -> processo do preparar-ambiente (a pausa mata)
const LOG_AMB = '.ambiente.log'; // saída completa do último preparo (rodapé → Ambiente: log ao vivo; base da análise do Claude)

module.exports = { AMBIENTE, TRAVA, donoAmbiente, travar, ambiente, hoje, preparos, LOG_AMB };
