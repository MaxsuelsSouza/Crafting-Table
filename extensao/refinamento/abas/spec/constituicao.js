// @ts-check
// Os 7 passos do SDD na aba Spec (constituição): estado, resumo, portões, subetapas do passo 3, Abrir, Aprovar e Pedir ajuste.
const fs = require('fs');
const path = require('path');
const { esc } = require('../../../infra/texto');
const { quando } = require('../../../componentes/formato');
const maestro = require('../../../painel/maestro');
const caixaEtapas = require('../../../componentes/caixa-etapas');
const mudancas = require('../../etapas/comentarios/regras');
const orq = require('../../orquestrador');
const { pasta, nomeProvedor, copiaAprovada } = require('./comum');

const STATUS = {
  pendente: 'Pendente',
  em_andamento: 'Claude trabalhando',
  aguardando_revisao: 'Aguardando sua revisão',
  aprovado: 'Aprovado',
  desatualizado: 'Desatualizado'
};

function telaConstituicao(r, est, abertos, impactos = []) {
  if (!est)
    return `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>specs/NNN-…/</code> em ${esc(path.basename(r.spec?.repo || 'repositório'))} e começa pelo passo 0.</div>`;
  const abertas = est.perguntas.filter((q) => q.status === 'aberta');
  const bloq = est.achados.filter((a) => a.severidade === 'bloqueante' && a.status === 'aberto');
  const ROTULO = {
    regras: 'regras',
    proibicoes: 'proibições',
    secoes: 'seções',
    rfs: 'requisitos',
    historias: 'histórias',
    bordas: 'casos de borda',
    tecnologias: 'tecnologias',
    endpoints: 'endpoints',
    entidades: 'entidades',
    violacoes: 'violações',
    tarefas: 'tarefas',
    feitas: 'feitas',
    ultimaTarefa: 'última tarefa',
    ultimoCommit: 'último commit'
  };
  const vivo = !maestro.rodando(pasta(r.id)); // Aprovar só com o Claude parado
  const atencao = mudancas.passosAfetados(impactos),
    decide = mudancas.pendentes(impactos).length > 0; // mudança pedida em comentário, ainda sem decisão
  const chip = (k, v, alerta) =>
    `<span class="chip ${alerta ? 'alerta' : ''}">${esc(ROTULO[k] || k)}: ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>`;
  return `<div class="sdd-topo"><b>${esc(est.feature)}</b> · ${esc(path.basename(r.spec.repo))}<br>Próxima ação: ${esc(est.proximaAcao || '')}</div>
  <div class="passos">${est.passos
    .map((p) => {
      const lido = abertos.has(`${r.id}:${p.n}:${p.hash}`);
      const anteriores = est.passos
        .slice(0, p.n)
        .filter((x) => !x.dispensado && x.status !== 'aprovado')
        .map((x) => x.n);
      const portaoFechado = p.n === 2 ? abertas.length : p.n === 5 ? bloq.length : 0;
      const resumo = Object.entries(p.resumo || {}).filter(
        ([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)
      );
      const extra =
        p.n === 2 && est.perguntas.length
          ? `<ul class="lista-mini">${est.perguntas.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.pergunta)} — ${q.status === 'respondida' ? esc(q.resposta) : `<i>${esc(q.status)}</i>`}</li>`).join('')}</ul>`
          : p.n === 5 && est.achados.length
            ? `<ul class="lista-mini">${est.achados.map((a) => `<li><b>${esc(a.id)}</b> [${esc(a.severidade)}] ${esc(a.descricao)} — <i>${esc(a.status)}</i></li>`).join('')}</ul>`
            : '';
      const aten = atencao.has(p.n) && p.status !== 'pendente';
      return `<div class="passo s-${esc(p.status)}${aten ? ' s-atencao' : ''}">
      <div class="cab"><span class="num">${p.n}</span>${aten ? `<span class="aten" title="Um comentário do ${esc(nomeProvedor(r))} pediu uma mudança que pode atingir este passo. Nada foi alterado: decida na caixa vermelha acima.">⚠</span>` : ''}<span class="nome">${esc(p.titulo)}${p.portao ? ` · Portão ${p.portao}` : ''}</span>
        <span class="st">${STATUS[p.status] || esc(p.status)}${p.versao ? ` · v${esc(p.versao)}` : ''}</span></div>
      ${
        p.n === 3 && (p.status !== 'pendente' || est.proximoPasso === 3)
          ? `<div class="passo-subs">${caixaEtapas.caixa({
              titulo: 'Etapas do plano técnico',
              etapas: [
                {
                  n: 3,
                  nome: p.titulo,
                  aberta: true,
                  estado:
                    {
                      pendente: vivo ? 'pendente' : 'rodando',
                      em_andamento: vivo ? 'pausada' : 'rodando',
                      aguardando_revisao: 'aguardando',
                      aprovado: 'concluida'
                    }[p.status] || 'pendente',
                  subetapas: orq.subetapas3(r, p, !vivo)
                }
              ],
              atual: 3
            })}</div>`
          : ''
      }
      ${
        p.status === 'pendente'
          ? ''
          : `<div class="corpo-passo">
        ${resumo.length ? `<div class="chips">${resumo.map(([k, v]) => chip(k, v, /viola|bloque|abertas/.test(k) && Number(v) > 0)).join('')}</div>` : ''}
        ${p.status === 'aprovado' ? `<div>Aprovado por <b>${esc(p.aprovadoPor || '')}</b> em ${esc(quando(p.aprovadoEm))}</div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="motivo">${esc(p.motivoDesatualizado || '')}</div>` : ''}
        ${
          p.status === 'aguardando_revisao' && portaoFechado
            ? `<div class="motivo">Portão fechado: ${p.n === 2 ? `${abertas.length} pergunta(s) aberta(s)` : `${bloq.length} achado(s) bloqueante(s)`}
          <ul class="lista-mini">${(p.n === 2 ? abertas.map((q) => [q.id, q.pergunta]) : bloq.map((a) => [a.id, a.descricao])).map(([id, t]) => `<li><b>${esc(id)}</b> ${esc(t)}</li>`).join('')}</ul>
          <div>Responda/resolva na conversa ou aceite com justificativa.</div></div>`
            : ''
        }
        ${extra}
        <div class="format-bar arquivo">
          <button class="fb-btn" data-acao="specAbrir" data-id="${p.n}" title="${esc(p.arquivo)}">Abrir ${esc(path.basename(p.arquivo))}</button>
          <button class="fb-btn" data-acao="specMencionar" data-id="${p.n}" title="Mencionar no Claude">@</button>
          ${p.hashAprovado && p.hash !== p.hashAprovado && fs.existsSync(copiaAprovada(r, p.n)) ? `<button class="fb-btn" data-acao="specMudancas" data-id="${p.n}" title="Diferença para a versão aprovada">Ver mudanças</button>` : ''}
        </div>
        ${
          p.status === 'aguardando_revisao'
            ? `<div class="acoes-passo">
          <button class="aprovar ${vivo && !decide ? '' : 'travado'}" data-acao="specAprovar" data-id="${p.n}" ${decide || anteriores.length ? 'disabled' : !vivo || (lido && !portaoFechado) ? '' : 'disabled'}
            title="${anteriores.length ? `Aprove antes o(s) passo(s) ${anteriores.join(', ')}` : decide ? `Decida primeiro a mudança pedida em comentário do ${esc(nomeProvedor(r))} (caixa vermelha acima)` : !vivo ? 'O Claude ainda está trabalhando: espere a etapa terminar' : !lido ? 'Abra o arquivo antes de aprovar: nunca aprove sem ler' : portaoFechado ? 'Resolva as pendências do portão' : 'Aprovar este passo'}">Aprovar</button>
          <button data-acao="specAjuste" data-id="${p.n}">Pedir ajuste</button></div>`
            : ''
        }
        ${p.status === 'desatualizado' ? `<div class="acoes-passo"><button data-acao="specContinuar">Reconciliar</button></div>` : ''}
      </div>`
      }
    </div>`;
    })
    .join('')}</div>`;
}

module.exports = { STATUS, telaConstituicao };
