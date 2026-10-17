// @ts-check
// 0.2 · Dossiê do pai e trabalho já feito (extensão, sem IA): o dossiê do ticket pai (01-dossie/1.1) já procura branches e commits com a
// chave do pai e das subtarefas (infra/dossie/trabalho-existente.js). Aqui cada subtarefa concluída ganha a branch onde o código dela
// está (subtarefas.json, campo branch), para o plano citar e para a branch <tipo>/<CHAVE> partir dela (05-implementacao/regras/base-branch.js).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { reChave } = require('../../../../../infra/dossie/trabalho-existente');
const { prepararDossie } = require('../../01-dossie/subetapas/1.1-dossie');
const { SUBS, lerSubs } = require('../arquivos');

// Branch (nome) com a chave da subtarefa no nome ou com um commit dela; '' = não achei.
const branchDe = (key, trabalho) => {
  const re = reChave([key]);
  for (const r of trabalho || []) {
    const b = r.branches.find((x) => re.test(x.nome) || x.commits?.some((c) => re.test(c.assunto)));
    if (b) return b.nome;
    const solto = r.foraDeBranch.find((c) => re.test(c.assunto));
    if (solto?.branches?.length) return solto.branches[0];
    if (r.integrados.some((c) => re.test(c.assunto))) return `(integrada em ${r.principal})`;
  }
  return '';
};

async function dossiePai(s, t) {
  const dir = s.pastaAba(t.id),
    d = await prepararDossie(s, t);
  const subs = lerSubs(dir).map((x) =>
    x.situacao === 'concluida' ? { ...x, branch: branchDe(x.key, d.trabalho) } : x
  );
  fs.writeFileSync(path.join(dir, SUBS), JSON.stringify(subs, null, 2));
  const semCodigo = subs.filter((x) => x.situacao === 'concluida' && !x.branch).map((x) => x.key);
  if (semCodigo.length)
    aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `Concluída(s) sem branch nem commit encontrado: ${semCodigo.join(', ')} (o plano confere no código)`
    });
  return d;
}

module.exports = { dossiePai, branchDe };
