// @ts-check
// Publicar o resultado no provedor (ou salvar no documento) com as evidências.
const vscode = require('vscode');
const path = require('path');
const qa = require('../../motor');
const aoVivo = require('../../../componentes/ao-vivo');
const sessao = require('../../../infra/ticket/sessao');
const jira = require('../../../infra/provedores/fachada').jira;
const { docLocal, depsPublicar } = require('./dependencias');
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const publicar = (s) => ({
  // Publicar: comentário com o resultado na subtarefa de QA + evidências da última execução de cada cenário (anexos).
  async qaPublicar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id),
      r = qa.cenarios(dir),
      local = docLocal(t);
    let sub = qa.estado(dir).subtarefa;
    const feitos = r.cenarios.filter((c) => !c.arquivado && qa.RESULTADOS.includes(c.status));
    if (!feitos.length) return;
    if (!sub && !local)
      return void vscode.window.showWarningMessage(
        'Sem subtarefa de QA para publicar: procure ou crie o planejamento primeiro (▶).'
      );
    if (!qa.podePublicar(r.cenarios))
      return vscode.window.showWarningMessage(
        'Só é possível publicar quando todos os cenários estiverem com resultado OK (passou).'
      );
    const arqs = feitos.flatMap((c) => qa.arquivosDe(dir, c.execucoes.at(-1)).map((f) => [c.id, f]));
    const ok = await vscode.window.showWarningMessage(
      local
        ? `Salvar no documento ${t.chave}: resultado de ${feitos.length} cenário(s) e ${arqs.length} evidência(s) (arquivos locais, nada sai da máquina)?`
        : `Publicar no ${sub}: comentário com ${feitos.length} cenário(s) e ${arqs.length} evidência(s) anexada(s)?`,
      { modal: true },
      local ? 'Salvar' : 'Publicar'
    );
    if (!ok) return;
    const ROT = { passou: '✅ Passou', falhou: '❌ Falhou', bloqueado: '⛔ Bloqueado' };
    const md = [
      `**Resultado do QA · plano v${r.planoVersao}** (Crafting Table)`,
      '',
      '| Cenário | Resultado | Observação |',
      '| --- | --- | --- |',
      ...feitos.map(
        (c) =>
          `| ${c.id} · ${c.titulo.replace(/\|/g, '/')} | ${ROT[c.status]} | ${(c.execucoes.at(-1)?.nota || '').replace(/\|/g, '/')} |`
      )
    ].join('\n');
    try {
      // Documento sem subtarefa de QA (plano só em qa-plano.md): cria a subtarefa local do resultado.
      if (!sub)
        sub = (await depsPublicar(s, t).criarSubtarefa({ resumo: '[QA] Resultado dos Testes', descricao: md })).key;
      qa.registrarDecisao(
        dir,
        local ? `Usuário salvou o resultado no documento (${sub})` : `Usuário publicou o resultado no ${sub}`,
        { ticket: t.chave }
      );
      await jira.comentar(s.secrets, { key: sub, site: t.site }, md);
      if (arqs.length)
        await jira.anexar(
          s.secrets,
          t.site,
          sub,
          arqs.map(([id, f]) => ({ arquivo: f, nome: `${id}-${path.basename(f)}` }))
        );
      aoVivo.anotar(dir, {
        tipo: 'fim',
        texto: local
          ? `Resultado salvo no documento: comentário em ${sub} (.comentarios.json) e ${arqs.length} evidência(s) em .publicado/${sub}/`
          : `Publicado no ${sub}: resultado de ${feitos.length} cenário(s) e ${arqs.length} evidência(s)`
      });
    } catch (e) {
      aoVivo.anotar(dir, {
        tipo: 'erro',
        texto: `Não consegui ${local ? 'salvar no documento' : `publicar no ${jira.nome}`}: ${e.message}`
      });
    }
    s.render();
  }
});

module.exports = { publicar };
