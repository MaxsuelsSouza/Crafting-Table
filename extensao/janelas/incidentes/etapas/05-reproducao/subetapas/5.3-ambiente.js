// @ts-check
// Subetapa 5.3 · Subir o ambiente do ticket (infra/ambientes: emulador, aparelho ou web; d.ambiente) pelos comandos de Configurações → Comandos.
// No emulador: liga o AVD, API, Metro e Start do app (Start só depois do Metro pronto). Idempotente: o que já está de pé segue.
// Na retomada roda de novo, pois o ambiente pode ter caído. O ambiente pronto fica em .ambiente.ok (a 5.4 lê o texto e o serial dele).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const ambientes = require('../../../../../infra/ambientes');
const { PAPEIS, comandoDo } = require('../../../../../infra/ambientes/aplicacao/papeis');
const { SUBETAPAS, pausar } = require('./estado');

const AMBIENTE = '.ambiente.ok';
// Pergunta da pausa por etapa em que o ambiente parou.
const PERGUNTA = {
  comandos: 'Cadastre o(s) comando(s) e tente de novo.',
  emulador: 'Ligue o emulador à mão ou tente de novo?',
  aparelho: 'Conecte e autorize o aparelho e tente de novo?',
  config: 'Ajuste a configuração e tente de novo?',
  app: 'Instale o app e tente de novo?'
};
const acharComando = comandoDo; // nome antigo (5.3 tinha a própria cópia dos papéis)

// Sobe tudo. Devolve { amb } (pronto) ou { motivo, pergunta } da primeira falha.
async function subirAmbiente(dir, d) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const a = ambientes.obter(d.ambiente);
  vivo('etapa', `Ambiente · ${a.rotulo}`);
  const r = await a.subir(
    dir,
    {
      comandos: d.comandos,
      esperar: d.esperar,
      portaAberta: d.portaAberta,
      metroStatus: d.metroStatus,
      appInstalado: d.appInstalado,
      emulador: d.emulador,
      adb: d.adb,
      avd: d.avd,
      serial: d.serial,
      webUrl: d.webUrl,
      backend: d.backend
    },
    vivo
  );
  if (r.parou_em) return { motivo: r.erro, pergunta: PERGUNTA[r.parou_em] || 'Corrija o terminal e tente de novo?' };
  return { amb: r };
}

// Devolve true se parou (pausa); false para seguir para a 5.4.
async function rodar({ dir, d, ponto, comecar, concluirSub }) {
  const S3 = SUBETAPAS[2];
  ponto();
  comecar(S3);
  const r = await subirAmbiente(dir, d);
  if (!('amb' in r)) return pausar(dir, r.motivo, r.pergunta);
  fs.writeFileSync(path.join(dir, AMBIENTE), JSON.stringify({ ...r.amb, em: new Date().toISOString() }, null, 2));
  concluirSub(S3);
  return false;
}

module.exports = { PAPEIS, AMBIENTE, acharComando, subirAmbiente, rodar };
