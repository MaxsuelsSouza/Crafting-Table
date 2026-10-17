// @ts-check
// Aba "Esteira": caixa de etapas (a 7 com as subetapas e o rótulo do teste, abas/teste.js), resumo do dossiê, explicação do dev (opcional), card de aprovação, card de pausa, o Ao vivo e as Alterações (alteracoes.js).
// Também o ▶/⏸ do cabeçalho do ticket (botaoPlay) e o script da webview (moldura.js): a explicação do dev grava ao sair do campo.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const caixaEtapas = require('../../../componentes/caixa-etapas');
const { esc } = require('../../../infra/texto');
const dossie = require('../../../infra/dossie');
const { ETAPAS } = require('../etapas');
const { MAX_CORRECOES } = require('../etapas/06-verificacao');
const { estado, situacao, controlesDe, existe } = require('../estado');
const { CSS, btn } = require('./css');
const { cartaoPausa, cartaoAprovacao } = require('./cartoes');
const { rotulo } = require('../etapas/05-implementacao/regras/nome-branch');
const { separar } = require('../etapas/00-subtarefas/regras/filtro');
const { reposDe } = require('../../../infra/ticket/repos');
const alteracoes = require('./alteracoes');
const teste = require('./teste');
const { SUBETAPAS: SUBETAPAS_TESTE } = require('../etapas/07-teste');

const resumoDossie = (d) =>
  d
    ? `<div class="es-resumo">Modo: <b>${esc(dossie.ROTULO_MODO[d.modo])}</b> · Prontidão: <b>${esc(d.prontidao)}</b> · Banco: <b>${d.capacidades.banco === 'leitura' ? 'leitura' : 'indisponível'}</b>
  ${d.lacunas.length ? `<br>${d.lacunas.map((l) => `⚠ ${esc(l)}`).join('<br>')}` : ''}</div>`
    : '';

// Antes de começar: o ticket com subtarefas abertas avisa que a esteira começa planejando os grupos (etapa 0).
const avisoSubtarefas = (t) => {
  const { abertas, concluidas } = separar(t.subtarefas);
  return abertas.length
    ? `<div class="folha"><div class="es-resumo">Este ticket tem <b>${abertas.length} subtarefa(s) aberta(s)</b>${concluidas.length ? ` e ${concluidas.length} concluída(s)` : ''}: a esteira começa pela <b>Etapa 0 · Subtarefas</b> (lê cada uma, monta até 2 grupos e pede a sua aprovação) e implementa tudo na branch <b>${esc(rotulo(t))}</b>.</div></div>`
    : '';
};

const corpo = (t, d0, dir) => {
  if (estado(dir).subtarefas === 'sim') return require('./grupos').corpo(t, d0, dir); // ticket com subtarefas: etapa 0 e grupos
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
      ...(x.n === 5 && e.correcao && atual
        ? {
            rotulo:
              e.correcao === 'teste'
                ? 'correção pelo teste na aplicação'
                : `correção ${e.tentativas} de ${MAX_CORRECOES}`
          }
        : {}),
      ...(x.n === 7 && (atual || feita) && teste.rotuloEtapa(dir, e, fase === 'rodando')
        ? { rotulo: teste.rotuloEtapa(dir, e, fase === 'rodando') }
        : {}),
      ...(x.n === 7 && atual
        ? {
            subetapas: SUBETAPAS_TESTE.map((nome, i) => ({
              nome,
              estado: i + 1 < (e.testeSub || 1) ? 'concluida' : i + 1 === (e.testeSub || 1) ? estadoAtual : 'pendente'
            }))
          }
        : {})
    };
  });
  const nova = e.etapa === 1 && fase === 'parado';
  const pausa = cartaoPausa(e, fase),
    aprovacao = cartaoAprovacao(e, fase, dir);
  const briefing = (() => {
    try {
      return fs.readFileSync(path.join(dir, dossie.BRIEFING), 'utf8').trim();
    } catch {
      return '';
    }
  })();
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Esteira de implementação', acao: nova ? btn('▶ Iniciar', 'esteiraIniciar', '', 'bt bt-principal') : '', etapas, atual: e.etapa })}
  ${nova ? avisoSubtarefas(t) : ''}${dos ? `<div class="folha">${resumoDossie(dos)}</div>` : ''}
  ${
    nova
      ? `<div class="caixa-t">Quer explicar o que precisa ser feito?<span>opcional</span></div>
  <div class="folha"><textarea class="es-obs" data-texto data-obs-impl placeholder="Explique com suas palavras (o que mudar, como saber que ficou certo). Vira a fonte verbal do dossiê.">${esc(briefing)}</textarea></div>`
      : ''
  }${aprovacao}${pausa}
  ${aoVivo.caixa(dir, sit.rodando, 'esteira', controlesDe(sit))}
  ${nova ? '' : alteracoes.CSS + alteracoes.caixa(dir, reposDe(t))}`;
};

/** ⏸/▶ do cabeçalho do ticket em Implementações (b monta o data-acao/data-painel). */
const botaoPlay = (dir, b) => {
  const sit = situacao(dir);
  return aoVivo.controle(sit.rodando, controlesDe(sit), b);
};
// Script da webview (moldura.js): a explicação do dev vai para a ação esteiraObs ao sair do campo.
const script = () => `// Esteira (implementações): a explicação do dev grava ao sair do campo.
  document.addEventListener('focusout', (e) => { if (e.target.matches?.('textarea[data-obs-impl]')) enviar({ acao: 'esteiraObs', texto: e.target.value }); });
  ${alteracoes.script()}`;

module.exports = { corpo, botaoPlay, script, resumoDossie };
