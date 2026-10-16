// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const jira = require('../../../infra/provedores/fachada').jira;
const aoVivo = require('../../../componentes/ao-vivo');
const { estadoSpec, refinoDe, gravarRefino } = require('../../locais');
const { pasta, nomeProvedor } = require('./comum');

// Spec concluída (todos os passos aprovados): anexa o refinamento.md ao ticket para quem for implementar. Ticket-documento é local: nada a anexar.
// O hash do arquivo anexado fica em .refinamento.json: aprovar de novo sem mudar o conteúdo não duplica o anexo.
async function anexarPacote(s, r) {
  if (!r || jira.ehDocumento(r) || (estadoSpec(r)?.proximoPasso ?? 0) <= 6) return;
  const dir = pasta(r.id),
    arq = require('../../pacote').gravar(r.id);
  if (!arq) return;
  const hash = require('crypto').createHash('sha256').update(fs.readFileSync(arq)).digest('hex');
  if (refinoDe(dir).anexado === hash) return;
  try {
    await jira.anexar(s.secrets, r.site, r.chave || r.id, [{ arquivo: arq, nome: path.basename(arq) }]);
    gravarRefino(dir, { anexado: hash });
    aoVivo.anotar(dir, { tipo: 'fim', texto: `refinamento.md anexado ao ${nomeProvedor(r)} (${r.chave || r.id})` });
  } catch (e) {
    aoVivo.anotar(dir, {
      tipo: 'erro',
      texto: `Não consegui anexar o refinamento.md ao ${nomeProvedor(r)}: ${e.message}`,
      detalhe: 'Abra o refinamento.md na aba Spec e anexe à mão, ou aprove de novo para tentar outra vez.'
    });
    vscode.window.showWarningMessage(
      `${r.chave || r.id}: não consegui anexar o refinamento.md ao ${nomeProvedor(r)} (${e.message}).`
    );
  }
}

module.exports = { anexarPacote };
