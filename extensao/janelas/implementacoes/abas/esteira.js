// @ts-check
// Aba "Esteira": caixa de etapas, resumo do dossiê, explicação do dev (opcional), card de aprovação, card de pausa e o Ao vivo.
// Também o ▶/⏸ do cabeçalho do ticket (botaoPlay) e o script da webview (moldura.js): a explicação do dev grava ao sair do campo.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const caixaEtapas = require('../../../componentes/caixa-etapas');
const { esc } = require('../../../infra/texto');
const dossie = require('../../../infra/dossie');
const { ETAPAS } = require('../etapas');
const { MAX_CORRECOES } = require('../etapas/06-verificacao');
const { situacao, controlesDe, existe } = require('../estado');
const { CSS, btn } = require('./css');

const resumoDossie = (d) =>
  d
    ? `<div class="es-resumo">Modo: <b>${esc(dossie.ROTULO_MODO[d.modo])}</b> · Prontidão: <b>${esc(d.prontidao)}</b> · Banco: <b>${d.capacidades.banco === 'leitura' ? 'leitura' : 'indisponível'}</b>
  ${d.lacunas.length ? `<br>${d.lacunas.map((l) => `⚠ ${esc(l)}`).join('<br>')}` : ''}</div>`
    : '';

const corpo = (t, d0, dir) => {
  const sit = situacao(dir),
    e = sit.e,
    fase = sit.fase,
    dos = dossie.lerGravado(dir);
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
    const feita = fase === 'concluido' || (x.n < e.etapa && existe(dir, x.n));
    const atual = x.n === e.etapa && !feita;
    return {
      n: x.n,
      nome: x.nome,
      estado: feita ? 'concluida' : atual ? estadoAtual : 'pendente',
      ...(atual && fase === 'parado' ? { rotulo: 'pronta para iniciar' } : {}),
      ...(x.n === 1 && atual && dos?.exigeReproducao && !['ok', 'aceita'].includes(e.reproducao) && fase !== 'parado'
        ? { rotulo: 'reproduzindo o bug' }
        : {}),
      ...(x.n === 5 && e.correcao && atual ? { rotulo: `correção ${e.tentativas} de ${MAX_CORRECOES}` } : {})
    };
  });
  const nova = e.etapa === 1 && fase === 'parado';
  const pausa =
    e.pausa && fase === 'pausado'
      ? `<div class="caixa-t">Pausa da esteira</div><div class="folha"><div class="es-pausa"><p>${esc(e.pausa.pergunta)}</p>
    ${
      e.pausa.motivo === 'manual'
        ? `<div class="es-barra">${btn('▶ Retomar', 'esteiraRetomar', '', 'bt bt-principal')}</div>`
        : `${e.pausa.opcoes.length ? `<div class="es-barra">${e.pausa.opcoes.map((o, i) => btn(esc(o), 'esteiraResponder', ` data-op="${i}"`)).join('')}</div>` : ''}
      ${
        ['sujo', 'git', 'repos'].includes(e.pausa.motivo) ||
        (e.pausa.opcoes.length &&
          ['sync', 'sem-mudanca', 'verificacao', 'repro-nao', 'repro-evidencia'].includes(e.pausa.motivo))
          ? ''
          : `<textarea class="es-obs" data-texto placeholder="Sua resposta…" style="margin-top:8px"></textarea><div class="es-barra">${btn('Responder e continuar', 'esteiraResponder', '', 'bt bt-principal')}</div>`
      }`
    }</div></div>`
      : '';
  const et = ETAPAS[e.etapa - 1],
    lido = !!e.aprovacao?.lido;
  const aprovacao =
    fase === 'aguardando' && et
      ? `<div class="agora"><div class="atitulo">Revise a etapa ${et.n} · ${esc(et.nome)}</div>
    <div class="atexto">Abra <b>${esc(et.arq)}</b>, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.${et.n === 4 ? ' Aprovar libera a esteira a alterar o código dos repositórios (em branch própria, sem commit).' : ''}</div>
    <div class="aacoes"><div class="format-bar arquivo"><button class="fb-btn" data-acao="esteiraAbrir" data-id="${et.n}" title="${esc(path.join(dir, et.arq))}">Abrir ${esc(et.arq)}</button></div>
      <div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-acao="esteiraAprovar" ${lido ? '' : 'disabled'} title="${lido ? 'Aprovar esta etapa: a esteira segue sozinha' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
        <button data-acao="esteiraAjuste">Pedir ajuste</button></div></div></div>`
      : '';
  const briefing = (() => {
    try {
      return fs.readFileSync(path.join(dir, dossie.BRIEFING), 'utf8').trim();
    } catch {
      return '';
    }
  })();
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Esteira de implementação', acao: nova ? btn('▶ Iniciar', 'esteiraIniciar', '', 'bt bt-principal') : '', etapas, atual: e.etapa })}
  ${dos ? `<div class="folha">${resumoDossie(dos)}</div>` : ''}
  ${
    nova
      ? `<div class="caixa-t">Quer explicar o que precisa ser feito?<span>opcional</span></div>
  <div class="folha"><textarea class="es-obs" data-texto data-obs-impl placeholder="Explique com suas palavras (o que mudar, como saber que ficou certo). Vira a fonte verbal do dossiê.">${esc(briefing)}</textarea></div>`
      : ''
  }${aprovacao}${pausa}
  ${aoVivo.caixa(dir, sit.rodando, 'esteira', controlesDe(sit))}`;
};

/** ⏸/▶ do cabeçalho do ticket em Implementações (b monta o data-acao/data-painel). */
const botaoPlay = (dir, b) => {
  const sit = situacao(dir);
  return aoVivo.controle(sit.rodando, controlesDe(sit), b);
};
// Script da webview (moldura.js): a explicação do dev vai para a ação esteiraObs ao sair do campo.
const script = () => `// Esteira (implementações): a explicação do dev grava ao sair do campo.
  document.addEventListener('focusout', (e) => { if (e.target.matches?.('textarea[data-obs-impl]')) enviar({ acao: 'esteiraObs', texto: e.target.value }); });`;

module.exports = { corpo, botaoPlay, script };
