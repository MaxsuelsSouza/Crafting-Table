// @ts-check
// Aba Mergulho dos Incidentes: a caixa de etapas, a observação do PO, o cartão de aprovação, a pausa, o Ao vivo e o fluxo da reprodução.
// Também o ▶/⏸ do cabeçalho (botaoPlay), os cliques (acoes) e o script da webview (script). A execução é do orquestrador/.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../componentes/ao-vivo');
const caixaEtapas = require('../../componentes/caixa-etapas');
const controle = require('../../infra/controle');
const fluxo = require('../../componentes/fluxo-passos');
const { ETAPAS } = require('../etapas');
const reproducao = require('../etapas/05-reproducao');
const { estado, mudar, situacao, existe, RESPOSTAS } = require('../estado');
const orq = require('../orquestrador');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ⏸/▶ do componente Ao vivo (componentes/ao-vivo.js controle): ⏸ rodando; ▶ parado, com erro ou pausado por você; nada aguardando aprovação ou concluído.
const controlesDe = (sit) => ({
  pausar: 'mergulhoPausar',
  dicaPausar: 'Pausar o Mergulho: o Claude para e a etapa recomeça ao retomar',
  retomar:
    ['parado', 'erro'].includes(sit.fase) || (sit.fase === 'pausado' && sit.e.pausa?.motivo === 'manual')
      ? 'mergulhoRetomar'
      : null,
  dicaRetomar: 'Retomar o Mergulho da etapa em que parou'
});

const CSS = `<style>${caixaEtapas.CSS}
  .mg-obs { width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical; padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: 12.5px/1.5 var(--fc-font); }
  .mg-obs:focus { outline: none; border-color: var(--accent); }
  .mg-barra { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .mg-pausa { border-left: 3px solid var(--accent); padding-left: 10px; font-size: 12.5px; line-height: 1.55; }
  .mg-pausa p { margin: 0 0 8px; }
</style>`;
const btn = (txt, acao, extra = '', cls = 'bt bt-contorno') =>
  `<button class="${cls}" data-acao="${acao}"${extra}>${txt}</button>`;

const corpo = (t, d, dir) => {
  const sit = situacao(dir),
    e = sit.e,
    vivo = sit.rodando,
    fase = sit.fase; // execução interrompida (janela recarregada) conta como parada
  const subs = reproducao.estadoSubs(dir);
  const estadoAtual =
    {
      rodando: 'rodando',
      pausado: 'pausada',
      erro: 'erro',
      parado: 'pendente',
      aguardando: 'aguardando',
      concluido: 'concluida'
    }[fase] || 'pendente';
  const etapas = ETAPAS.map((x) => {
    const feita = existe(dir, x.n) && (x.n < e.etapa || (x.n === e.etapa && fase === 'concluido'));
    const atual = x.n === e.etapa && !feita;
    return {
      n: x.n,
      nome: x.nome,
      estado: feita ? 'concluida' : atual ? estadoAtual : 'pendente',
      ...(atual && fase === 'parado' ? { rotulo: 'pronta para iniciar' } : {}),
      // etapa 5: ao entrar nela a caixa expande com 5.1 a 5.4 antes de qualquer processo; só a subetapa em andamento herda a fase (pausa, erro, parada)
      ...(x.n === 5
        ? {
            subetapas: reproducao.SUBETAPAS.map((r) => ({
              n: r.n,
              nome: r.nome,
              estado:
                subs[r.id] === 'rodando'
                  ? atual
                    ? estadoAtual
                    : 'pendente'
                  : subs[r.id] === 'erro' && !atual
                    ? 'pendente'
                    : subs[r.id]
            }))
          }
        : {})
    };
  });
  const nova = e.etapa === 1 && fase === 'parado' && !existe(dir, 1);
  const pausa =
    e.pausa && fase === 'pausado'
      ? `<div class="caixa-t">Pausa do Mergulho</div><div class="folha"><div class="mg-pausa"><p>${esc(e.pausa.pergunta)}</p>
    ${
      e.pausa.motivo === 'manual'
        ? `<div class="mg-barra">${btn('▶ Retomar', 'mergulhoRetomar', '', 'bt bt-principal')}</div>`
        : e.pausa.motivo === 'anexos'
          ? `<div class="mg-barra">${btn('↓ Baixar todos', 'anexoTodos')}${btn('Continuar', 'mergulhoContinuar', '', 'bt bt-principal')}</div>`
          : `${e.pausa.opcoes.length ? `<div class="mg-barra">${e.pausa.opcoes.map((o, i) => btn(esc(o), 'mergulhoResponder', ` data-op="${i}"`)).join('')}</div>` : ''}
      <textarea class="mg-obs" data-texto placeholder="Sua resposta…" style="margin-top:8px"></textarea><div class="mg-barra">${btn('Responder e continuar', 'mergulhoResponder', '', 'bt bt-principal')}</div>`
    }</div></div>`
      : '';
  const et0 = ETAPAS[e.etapa - 1],
    lido = !!e.aprovacao?.lido;
  const et = et0 && e.aprovacao?.arq ? { ...et0, arq: e.aprovacao.arq, nome: e.aprovacao.nome || et0.nome } : et0; // portão da massa de teste (5.2): outro arquivo, mesmo cartão
  // Mesmo visual do refinamento (refinamento/spec.js): cartão "Agora" com o título e o texto, "Abrir <arquivo>" e os botões Aprovar (verde, travado até ler) e Pedir ajuste.
  const aprovacao =
    fase === 'aguardando' && et
      ? `<div class="agora"><div class="atitulo">Revise a etapa ${et.n} · ${esc(et.nome)}</div>
    <div class="atexto">Abra <b>${esc(et.arq)}</b>, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.</div>
    <div class="aacoes"><div class="format-bar arquivo"><button class="fb-btn" data-acao="mergulhoAbrir" data-id="${et.n}" title="${esc(path.join(dir, et.arq))}">Abrir ${esc(et.arq)}</button></div>
      <div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-acao="mergulhoAprovar" ${lido ? '' : 'disabled'} title="${lido ? 'Aprovar esta etapa: o Mergulho segue sozinho' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
        <button data-acao="mergulhoAjuste">Pedir ajuste</button></div></div></div>`
      : '';
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Mergulho', acao: nova ? btn('▶ Iniciar', 'mergulhoIniciar', '', 'bt bt-principal') : '', etapas, atual: e.etapa })}
  ${
    nova
      ? `<div class="caixa-t">Há alguma observação adicional deixada pelo PO?<span>opcional</span></div>
  <div class="folha"><textarea class="mg-obs" data-texto data-obs placeholder="Cole aqui o que o PO comentou fora do ticket (opcional)…">${esc(e.obsPO)}</textarea></div>`
      : e.obsPO
        ? `<div class="caixa-t">Observação do PO</div><div class="folha"><div style="white-space:pre-wrap">${esc(e.obsPO)}</div></div>`
        : ''
  }${aprovacao}${pausa}
  ${aoVivo.caixa(dir, vivo, 'mergulho', controlesDe(sit)) || '<div class="folha"><div class="vazio-aba">Nada ao vivo ainda.</div></div>'}
  ${fluxo.html(dir, d?.uri)}`;
};

// ⏸/▶ do cabeçalho do ticket em Incidentes (b = data-acao/data-painel já montado pelo cabecalho()), em qualquer aba.
const botaoPlay = (dir, b) => {
  const sit = situacao(dir);
  return aoVivo.controle(sit.rodando, controlesDe(sit), b);
};

// Script da webview (moldura.js junta os dos módulos): a observação do PO grava ao sair do campo.
const script = () =>
  `document.addEventListener('focusout', (e) => { if (e.target.matches?.('textarea[data-obs]')) enviar({ acao: 'mergulhoObs', texto: e.target.value }); });`;

const acoes = (s) => ({
  // Etapa 1 a 4 concluída: abrir o documento libera o Aprovar (nunca aprovar sem ler); Aprovar segue sozinho; Pedir ajuste roda a etapa de novo sobre o documento.
  mergulhoAbrir({ id }) {
    const t = s.ticketAberto(),
      n = Number(id),
      et = ETAPAS[n - 1];
    if (!t || !et) return;
    const dir = s.pastaAba(t.id),
      ap = estado(dir).aprovacao,
      nome = ap?.etapa === n && ap.arq ? ap.arq : et.arq,
      arq = path.join(dir, nome),
      vscode = require('vscode');
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    mudar(dir, { aprovacao: { ...(ap?.etapa === n ? ap : {}), etapa: n, lido: true } });
    vscode.commands.executeCommand(nome.endsWith('.md') ? 'markdown.showPreview' : 'vscode.open', vscode.Uri.file(arq));
    s.render();
  },
  async mergulhoAprovar() {
    const t = s.ticketAberto(),
      vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id),
      e = estado(dir),
      et = ETAPAS[e.etapa - 1],
      massa = !!e.aprovacao?.arq;
    if (e.fase !== 'aguardando' || !et) return;
    if (!e.aprovacao?.lido) return vscode.window.showWarningMessage('Abra e leia o documento antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(
      massa ? 'Aprovar a massa de teste?' : `Aprovar a etapa ${et.n} (${et.nome})?`,
      {
        modal: true,
        detail: massa
          ? 'A extensão vai executar o massa-teste.sql na base (INSERT e commit) e o Mergulho segue sozinho.'
          : 'Depois de aprovada, o Mergulho segue sozinho para a próxima etapa.'
      },
      'Aprovar'
    );
    if (!ok) return;
    if (massa) {
      reproducao.aprovarMassa(dir);
      aoVivo.anotar(dir, { tipo: 'fim', texto: 'Massa de teste aprovada por você' });
      mudar(dir, { fase: 'parado', aprovacao: null });
      return orq.seguir(s, t);
    }
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${et.n} aprovada por você` });
    mudar(dir, { etapa: et.n + 1, fase: 'parado', aprovacao: null });
    await orq.seguir(s, t);
  },
  async mergulhoAjuste() {
    const t = s.ticketAberto(),
      vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id),
      e = estado(dir),
      et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    const massa = e.aprovacao?.arq,
      arq = massa || et.arq;
    const texto = await vscode.window.showInputBox({
      title: `Ajuste ${massa ? 'na massa de teste' : `na etapa ${et.n} (${et.nome})`}`,
      prompt: 'O que o Claude deve mudar?',
      ignoreFocusOut: true
    });
    if (!texto?.trim()) return;
    fs.appendFileSync(path.join(dir, RESPOSTAS), `## Ajuste pedido na etapa ${et.n} (${arq})\n${texto.trim()}\n\n`);
    aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `Ajuste pedido ${massa ? 'na massa de teste' : `na etapa ${et.n}`}: ${texto.trim().slice(0, 120)}`
    });
    if (massa) {
      // a massa é refeita pelo Claude (5.2) a partir do pedido e volta ao portão
      fs.rmSync(path.join(dir, 'massa-teste.sql'), { force: true });
      mudar(dir, { fase: 'parado', aprovacao: null });
      return orq.seguir(s, t);
    }
    await orq.rodarEtapa(s, t, et.n, controle.nova(dir), true);
  },
  mergulhoPausar() {
    const t = s.ticketAberto();
    if (t) orq.pausarManual(s, t);
  },
  async mergulhoRetomar() {
    const t = s.ticketAberto();
    if (t) await orq.retomar(s, t);
  },
  // Guarda a observação do PO ao sair do campo (script() manda o texto no focusout).
  mergulhoObs({ texto }) {
    const t = s.ticketAberto();
    if (t && typeof texto === 'string') mudar(s.pastaAba(t.id), { obsPO: texto });
  },
  async mergulhoIniciar({ texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    if (typeof texto === 'string') mudar(s.pastaAba(t.id), { obsPO: texto });
    await orq.seguir(s, t);
  },
  async mergulhoContinuar() {
    const t = s.ticketAberto();
    if (t) await orq.seguir(s, t);
  },
  async mergulhoResponder({ op, texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    const p = estado(s.pastaAba(t.id)).pausa;
    await orq.responder(s, t, op !== undefined && op !== '' ? p?.opcoes?.[Number(op)] : texto);
  }
});

module.exports = { corpo, acoes, botaoPlay, script, controlesDe };
