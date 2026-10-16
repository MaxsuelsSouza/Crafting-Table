// @ts-check
// Publicar o resultado no provedor (ou salvar no documento): relatório da IA com o nível, e as evidências.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const aoVivo = require('../../../../componentes/ao-vivo');
const sessao = require('../../../../infra/ticket/sessao');
const jira = require('../../../../infra/provedores/fachada').jira;
const { docLocal, depsPublicar, depsQa } = require('./dependencias');
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const publicar = (s) => ({
  // Publicar: comentário com o resultado na subtarefa de QA + evidências da última execução de cada cenário (anexos).
  // Publicar: a IA escreve o relatório (Etapa 7), você confere o nível (aprovado, com ressalvas, reprovado; pode mudar com motivo)
  // e o relatório vai como comentário na subtarefa de QA, com as evidências da última execução de cada cenário e o próprio .md anexados.
  async qaPublicar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id),
      r = qa.cenarios(dir),
      local = docLocal(t),
      rel = qa.relatorio();
    let sub = qa.estado(dir).subtarefa;
    if (!sub && !local)
      return void vscode.window.showWarningMessage(
        'Sem subtarefa de QA para publicar: procure ou crie o planejamento primeiro (▶).'
      );
    if (!qa.podePublicar(r.cenarios))
      return vscode.window.showWarningMessage(
        `A execução ainda não terminou: ${qa.veredito(r.cenarios).motivos.join('; ') || 'nenhum cenário com resultado'}.`
      );
    if (qa.rodando(dir))
      return vscode.window.showInformationMessage('O QA está rodando: espere terminar para publicar.');
    const d = depsQa(s, t),
      escrever = async () => {
        qa.mudar(dir, { processando: 'Escrevendo o relatório…' });
        s.render();
        try {
          await rel.gerarRelatorio(dir, d);
        } finally {
          qa.mudar(dir, { processando: null });
          s.render();
        }
      };
    if (!rel.atual(dir)) await escrever();
    const arqRel = path.join(dir, rel.RELATORIO);
    if (!fs.existsSync(arqRel)) return;
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arqRel)); // leia; editar o .md vale na publicação
    const ROT = {
      aprovado: '✅ Aprovado',
      'aprovado-com-ressalvas': '⚠️ Aprovado com ressalvas',
      reprovado: '❌ Reprovado'
    };
    for (;;) {
      const n = rel.nivelFinal(dir);
      const op = await vscode.window.showWarningMessage(
        `${local ? 'Salvar no documento' : `Publicar no ${sub}`} com nível ${n.rotulo}?`,
        {
          modal: true,
          detail: [
            n.porque,
            n.nivel !== n.regra.nivel ? `Pela regra: ${n.regra.rotulo}.` : '',
            `${r.cenarios.filter((c) => !c.arquivado).length} cenário(s); o relatório aberto ao lado vai como comentário, com as evidências anexadas.`
          ]
            .filter(Boolean)
            .join('\n')
        },
        local ? 'Salvar' : 'Publicar',
        'Mudar nível…',
        'Refazer relatório'
      );
      if (!op) return;
      if (op === 'Refazer relatório') {
        await escrever();
        continue;
      }
      if (op === 'Mudar nível…') {
        const nv = await vscode.window.showQuickPick(
          Object.entries(ROT).map(([id, label]) => ({
            id,
            label,
            description: id === n.regra.nivel ? 'pela regra' : ''
          })),
          { placeHolder: 'Nível do resultado' }
        );
        if (!nv) continue;
        const motivo = await vscode.window.showInputBox({
          prompt: `Por que ${nv.label}? (vai no relatório e em Decisões)`,
          ignoreFocusOut: true,
          validateInput: (v) => (v.trim() ? null : 'O motivo é obrigatório')
        });
        if (!motivo?.trim()) continue;
        qa.mudar(dir, { relatorio: { ...qa.estado(dir).relatorio, nivelHumano: nv.id, motivoHumano: motivo.trim() } });
        qa.registrarDecisao(dir, `Usuário mudou o nível do QA para ${nv.label}`, {
          ticket: t.chave,
          motivo: motivo.trim()
        });
        continue;
      }
      break;
    }
    const feitos = r.cenarios.filter((c) => !c.arquivado && c.execucoes?.length),
      md = rel.compor(dir),
      final = path.join(dir, `relatorio-${t.chave}.md`);
    fs.writeFileSync(final, md);
    const arqs = [['', final], ...feitos.flatMap((c) => qa.arquivosDe(dir, c.execucoes.at(-1)).map((f) => [c.id, f]))];
    try {
      // Documento sem subtarefa de QA (plano só em qa-plano.md): cria a subtarefa local do resultado.
      if (!sub)
        sub = (await depsPublicar(s, t).criarSubtarefa({ resumo: '[QA] Resultado dos Testes', descricao: md })).key;
      qa.registrarDecisao(
        dir,
        local
          ? `Usuário salvou o resultado no documento (${sub}): ${rel.nivelFinal(dir).rotulo}`
          : `Usuário publicou o resultado no ${sub}: ${rel.nivelFinal(dir).rotulo}`,
        { ticket: t.chave }
      );
      await jira.comentar(s.secrets, { key: sub, site: t.site }, md);
      await jira.anexar(
        s.secrets,
        t.site,
        sub,
        arqs.map(([id, f]) => ({ arquivo: f, nome: id ? `${id}-${path.basename(f)}` : path.basename(f) }))
      );
      aoVivo.anotar(dir, {
        tipo: 'fim',
        texto: local
          ? `Resultado salvo no documento: relatório em ${sub} (.comentarios.json) e ${arqs.length} arquivo(s) em .publicado/${sub}/`
          : `Publicado no ${sub} (${rel.nivelFinal(dir).rotulo}): relatório de ${feitos.length} cenário(s) e ${arqs.length} arquivo(s)`
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
