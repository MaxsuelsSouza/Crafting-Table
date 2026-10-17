// @ts-check
// Planejamento: abrir, mencionar, aprovar (e publicar), pedir mudança e criar.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const aoVivo = require('../../../../componentes/ao-vivo');
const sessao = require('../../../../infra/ticket/sessao');
const jira = require('../../../../infra/provedores/fachada').jira;
const { docLocal, depsPublicar } = require('./dependencias');
const { gerarPlano } = require('./gerar-plano');
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const plano = (s) => ({
  qaPlanoAbrir() {
    const t = s.ticketAberto(),
      v = t && qa.versaoAtual(s.pastaAba(t.id));
    if (!v) return;
    qa.mudar(s.pastaAba(t.id), { lido: v.v }); // libera o Aprovar: só depois de ler
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(s.pastaAba(t.id), v.arquivo)));
    s.render();
  },
  qaPlanoMencionar() {
    const t = s.ticketAberto(),
      v = t && qa.versaoAtual(s.pastaAba(t.id));
    if (v) require('../../../../infra/agentes/conversa').mencionar(`@${path.join(s.pastaAba(t.id), v.arquivo)}`);
  },
  // Aprovar: plano só local (publicarPendente) é publicado agora, depois do modal; plano que já veio do provedor só aprova.
  async qaPlanoAprovar() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      e = qa.estado(dir);
    if (e.publicarPendente) {
      const ok = await vscode.window.showWarningMessage(
        `Aprovar o planejamento v${e.versao} e ${docLocal(t) ? 'salvar no documento' : `publicar no ${jira.nome}`}? Cria a subtarefa de QA, preenche a descrição vazia dela ou comenta nela (descrição com texto não é sobrescrita).`,
        { modal: true },
        'Aprovar e publicar'
      );
      if (!ok) return;
      qa.mudar(dir, { processando: 'Publicando o planejamento…' });
      s.render();
      try {
        // tipo: nome da subtarefa [QA] pelo tipo do pai; comentarEm: subtarefa que já tem descrição recebe o plano como comentário.
        await qa.aprovarPublicando(dir, {
          ...depsPublicar(s, t),
          tipo: t.tipo,
          comentarEm: docLocal(t) ? undefined : (key, md) => jira.comentar(s.secrets, { key, site: t.site }, md)
        });
      } catch (x) {
        aoVivo.anotar(dir, { tipo: 'erro', texto: `Não consegui publicar o plano: ${x.message}` });
        qa.mudar(dir, { erro: x.message });
        return s.render();
      } finally {
        qa.mudar(dir, { processando: null });
      }
    } else if (!qa.aprovar(dir)) return;
    qa.registrarDecisao(dir, 'Usuário aprovou o planejamento', { ticket: t.chave });
    s.render();
  },
  // Pedir mudança: o Claude edita o qa-plano.md local e a extensão republica no provedor; ao terminar, a versão nova volta para aprovação.
  async qaPlanoMudar() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      v = qa.versaoAtual(dir);
    if (!v) return;
    const pedido = await vscode.window.showInputBox({
      title: `Mudança no planejamento ${v.subtarefa} · v${v.v}`,
      prompt: `O Claude edita o plano, a Crafting Table ${docLocal(t) ? 'salva no documento' : `republica no ${jira.nome}`} e gera a versão nova para você aprovar`,
      ignoreFocusOut: true
    });
    if (!pedido?.trim()) return;
    qa.registrarDecisao(dir, 'Usuário pediu ajuste no planejamento', { ticket: t.chave, pedido: pedido.trim() });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, qa.PLANO_LOCAL), qa.mdDaVersao(dir, v)); // a IA edita o arquivo local; a extensão republica
    const ok = await gerarPlano(s, t, dir, {
      prompt: (rasc) => qa.promptMudanca(dir, pedido.trim(), rasc),
      titulo: `QA · Aplicando mudança no planejamento (${v.subtarefa})`,
      mudanca: true
    });
    if (ok) qa.mudar(dir, { fase: 'alterando', pedido: pedido.trim() });
    s.render();
  },
  // Criar planejamento: a IA escreve qa-plano.md em segundo plano; a extensão publica no provedor e confere de novo.
  async qaCriarPlano() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id);
    fs.rmSync(path.join(dir, qa.PLANO_LOCAL), { force: true });
    const ok = await gerarPlano(s, t, dir, {
      prompt: (rasc) => qa.promptCriar(dir, rasc),
      titulo: 'QA · Criando o planejamento'
    });
    if (ok) qa.mudar(dir, { fase: 'criando', pausa: null });
    s.render();
  }
});

module.exports = { plano };
