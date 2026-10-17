// @ts-check
// 1.4 · Ref e ambiente (código, sem IA): o código em que o erro é reproduzido e o ambiente de pé nele.
//   1. ref por repositório: infra/git refParaReproduzir (incidente e bug: a principal; o ticket cita homologação/pre-release/hml: a candidata)
//   2. git checkout --detach <commit> (infra/git destacar): sujo → pausa 'sujo'; o HEAD de antes fica em .esteira.json (regras/head.js)
//   3. ambiente do ticket (infra/ambientes escolher + subir); o sha do Pronto tem de bater com o commit
// Devolve { motivo } (vazio = pronto; senão o veredito é INCONCLUSIVO), { pausou } ou o ambiente pronto { nome, pronto, refs }.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const git = require('../../../../../infra/git');
const { CONTEXTO, TENTAR, estado, mudar, pausar } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');
const { EVIDENCIAS_MD } = require('../reproducao/evidencias-ticket');
const { guardar, restaurar } = require('../regras/head');
const { deps } = require('../dependencias');

const HOMOLOGACAO = /homolog|pre-?release|\bhml\b/i;
const ler = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

async function refAmbiente(s, t, d) {
  const dir = s.pastaAba(t.id),
    { repos } = ambiente(s, t),
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'Reprodução 1.4 · Ref e ambiente');
  if (!repos.length) return { motivo: 'nenhum repositório de código configurado' };
  const achadoEmHomologacao = HOMOLOGACAO.test(ler(path.join(dir, EVIDENCIAS_MD)) + ler(path.join(dir, CONTEXTO)));
  const o = { categoria: d.categoria, candidatas: git.candidatasDaConfig() };
  const refs = {};
  for (const r of repos) {
    let x = git.refParaReproduzir(r, [t.chave], { ...o, achadoEmHomologacao });
    if (!x && achadoEmHomologacao) {
      x = git.refParaReproduzir(r, [t.chave], { ...o, achadoEmHomologacao: false, buscar: false });
      if (x) x.motivo += ' (o ticket cita homologação, mas nenhuma pre-release tem commit da chave)';
    }
    if (!x)
      return {
        motivo: `${path.basename(r.caminho)}: não achei a ref para reproduzir (branch principal não encontrada)`
      };
    const dz = git.destacar(r, x.commit, { chave: t.chave });
    if (!dz.ok) {
      restaurar(dir);
      pausar(dir, 1, { motivo: dz.motivo === 'sujo' ? 'sujo' : 'git', pergunta: String(dz.texto), opcoes: [TENTAR] });
      return { pausou: true };
    }
    guardar(dir, r.caminho, dz.de);
    refs[r.caminho] = x;
    vivo('acao', `${path.basename(r.caminho)}: ${x.ref} (${x.commit.slice(0, 10)}) · ${x.motivo}`);
  }
  const nome = deps.ambiente(s, t);
  mudar(dir, { repro: { ...(estado(dir).repro || {}), refs, ambiente: nome } });
  const pronto = await deps.subir(dir, nome, vivo);
  if (pronto.parou_em) return { motivo: `o ambiente ${nome} não subiu (${pronto.parou_em}): ${pronto.erro}` };
  for (const r of repos) {
    if (!(r.camada in (pronto.sha || {}))) continue;
    const v = pronto.sha[r.camada],
      c = refs[r.caminho].commit;
    if (!v || !c.startsWith(v))
      return {
        motivo: `o ${r.camada} do ambiente roda ${v || 'um commit que não consegui ler'}, não ${c.slice(0, 10)} (${refs[r.caminho].ref})`
      };
  }
  vivo('fim', `Ambiente ${nome} de pé na ref da reprodução`);
  return { motivo: '', nome, pronto, refs };
}

module.exports = { refAmbiente, HOMOLOGACAO };
