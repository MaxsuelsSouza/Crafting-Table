// @ts-check
// Apoio dos testes da esteira (não é teste): a etapa 7 (Teste na aplicação) sem aplicação de verdade. instalar() troca o ambiente por um
// "web" que sobe na hora; simular(dir, opts) responde aos claude -p "Etapa 7.1" (grava um plano válido) e "Etapa 7.3" (executa cada CT
// pendente com print e vídeo, com o resultado de sim.resultado(id)). Devolve false para os outros títulos.
const fs = require('fs');
const os = require('os');
const path = require('path');
const fluxo = require('../../../componentes/fluxo-passos');
const { deps } = require('../etapas/07-teste/dependencias');

const PLANO = [
  '## Cenários de Teste',
  '#### CT01 – Fluxo principal do ticket',
  'Criticidade: critica',
  'Tipo: aceite',
  '**Dado que** a tela está aberta **Quando** confirmo **Então** salva',
  '#### CT02 – Lista continua funcionando',
  'Criticidade: normal',
  'Tipo: regressao',
  '**Dado que** abro a lista **Então** ela carrega',
  '## Critérios de aceite cobertos',
  '| Critério | Cenários | Fonte | Confiança |',
  '|---|---|---|---|',
  '| CA1 salvar | CT01 | ticket | aprovado |',
  '| CA2 lista | CT02 | ticket | aprovado |',
  ''
].join('\n');
const sim = {
  plano: PLANO,
  resultado: (_id) => 'passou',
  subiu: true,
  titulos: /** @type {string[]} */ ([])
};
const AMB = {
  nome: 'web',
  rotulo: 'navegador',
  plataforma: 'web',
  ferramentas: [],
  requisitos: () => [],
  subir: async () =>
    sim.subiu ? { nome: 'web', parou_em: null, url: 'http://x' } : { parou_em: 'web', erro: 'porta 9009 fechada' },
  saude: async () => ({ ok: true }),
  evidencia: { gravar() {}, parar() {}, arquivos: () => [] },
  texto: () => 'front http://x',
  guia: () => '',
  comoPrint: (f) => `print em ${f}`
};
function instalar() {
  deps.ambiente = () => ({ nome: 'web', a: AMB, ctx: {} });
  deps.qaPlano = () => null;
}
function simular(dir, opts) {
  const m = /Etapa 7\.(\d)/.exec(opts.titulo || '');
  if (!m) return false;
  sim.titulos.push(`7.${m[1]}`);
  setImmediate(() => {
    const dt = path.join(dir, 'teste');
    if (m[1] === '1') {
      fs.mkdirSync(dt, { recursive: true });
      fs.writeFileSync(path.join(dt, 'plano-cts.md'), sim.plano);
    }
    if (m[1] === '3') {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-'));
      for (const p of fluxo.ler(dt).passos.filter((x) => x.status === 'pendente')) {
        fluxo.iniciar(dt, p.id);
        const png = path.join(tmp, `${p.id}.png`),
          webm = path.join(tmp, `${p.id}.webm`);
        fs.writeFileSync(png, 'png');
        fs.writeFileSync(webm, 'webm');
        fluxo.evidencia(dt, p.id, [png, webm]);
        fluxo.sinais(dt, p.id, { console: 0, rede: 0 });
        fluxo.concluir(dt, p.id, sim.resultado(p.id), 'visto');
      }
    }
    opts.aoMudar();
  });
  return true;
}

module.exports = { sim, instalar, simular, PLANO };
