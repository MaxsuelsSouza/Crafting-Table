// @ts-check
// Ambiente no rodapé: análise do Claude, modal do erro e log ao vivo.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const { depsQa } = require('./dependencias');
const canaisLog = new Map(); // arquivo de log -> OutputChannel
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const ambiente = (s) => ({
  async qaAmbAnalisar() {
    const t = s.ticketAberto();
    if (t) {
      await qa.analisarAmbiente(s.pastaAba(t.id), depsQa(s, t));
      s.render();
    }
  },
  // Log ao vivo: terminal acompanhando o log do preparo (tail -F); pelos Comandos, também os terminais da API e do Metro.
  // Modal do erro do ambiente: a análise do Claude (ou o erro cru, se ainda não houver análise), com log ao vivo e reanálise.
  async qaAmbErro() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      r = qa.resumoErroAmbiente(dir);
    if (!r) return;
    qa.analiseVista(dir);
    s.render();
    const detalhe = r.analise
      ? `Análise do Claude\n\n${r.analise}${r.detalhe ? `\n\n─────\n${r.detalhe}` : ''}`
      : `${r.detalhe || 'Sem detalhe.'}\n\nO Claude ainda não analisou este erro.`;
    const botoes = [
      'Log ao vivo',
      ...(qa.rodando(dir) ? [] : [r.analise ? 'Analisar de novo' : 'Analisar com o Claude'])
    ];
    const escolha = await vscode.window.showErrorMessage(r.titulo, { modal: true, detail: detalhe }, ...botoes);
    if (escolha === 'Log ao vivo') acoes(s).qaAmbLog();
    else if (escolha) acoes(s).qaAmbAnalisar();
  },
  qaAmbLog() {
    // canaisLog: um canal e um watch por log
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      a = qa.ambiente(dir),
      cmds = require('../../../../modulos/comandos').api;
    for (const nome of a?.terminais || []) {
      const b = cmds?.lista().find((x) => x.nome === nome);
      if (b?.rodando) cmds?.acao({ acao: 'mostrar', id: b.id });
    }
    // Output channel (sem terminal): despeja o .ambiente.log e segue acompanhando o que o preparo gravar.
    const f = path.join(dir, qa.LOG_AMB);
    if (canaisLog.has(f)) return canaisLog.get(f).show(true); // já aberto: só mostra (o watch segue gravando)
    const ch = vscode.window.createOutputChannel(`QA ${t.chave} · log do ambiente`);
    canaisLog.set(f, ch);
    let lido = 0;
    const ler = () => {
      try {
        const b = fs.readFileSync(f);
        if (b.length < lido) lido = 0;
        ch.append(b.subarray(lido).toString('utf8'));
        lido = b.length;
      } catch {
        /* log ainda não existe */
      }
    };
    ler();
    fs.watchFile(f, { interval: 700 }, ler); // ponytail: o watch vive até a janela fechar; um por clique
    ch.show(true);
  }
});

module.exports = { ambiente };
