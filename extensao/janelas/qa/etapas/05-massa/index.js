// @ts-check
// Etapa 5 · Massa de dados (.massa.json, aba Massa): busca só leitura por até 5 min, depois produzir por UPDATE (o humano aprova), senão desiste e segue.
//   estado.js            .massa.json, massa add/estado e a janela da etapa (emEtapaMassa)
//   regras/validade.js   validade até o refresh do banco e a sincronia com a aba Massa
//   regras/sql.js        o que um lote de alteração pode ter (só INSERT/UPDATE/DELETE com WHERE)
//   dependencias.js      executar o lote no SQLcl
//   prompt.js            prompt da busca e da produção, ferramentas
//   proposta.js          lote SQL proposto pela IA: aprovar, recusar, desfazer
//   desistir.js          sem massa e sem UPDATE possível: bloqueia o cenário e segue
const aoVivo = require('../../../../componentes/ao-vivo');
const vagas = require('../../../../infra/agentes/etapas');
const { estado, mudar } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { claude } = require('../../orquestrador/claude');
const { absorverPausa } = require('../../orquestrador/pausa');
const { sincronizarMassa, semMassa } = require('./regras/validade');
const { MASSA_BUSCA_MIN, promptMassa, FERRAMENTAS_MASSA } = require('./prompt');
const { desistirMassa } = require('./desistir');

// Etapa 4: o Claude levanta massa para os cenários dados. `etapa: 'massa'` no estado libera o `qa-state massa add` só durante ela.
// Trava de banco: relê a aba antes; só vai ao banco quem não tem massa válida lá, e cenário com a massa da aba toda consumida encerra a busca.
async function levantarMassa(dir, d, amb, cens) {
  const sync = sincronizarMassa(
    dir,
    cens.map((c) => c.id),
    new Date(),
    d.horaRefresh
  );
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const naAba = Object.values(sync.validas).flat();
  const busca = cens.filter((c) => sync.faltam.includes(c.id) && !sync.esgotadas.includes(c.id));
  if (sync.esgotadas.length)
    vivo('aviso', `Massa da aba toda consumida para ${sync.esgotadas.join(', ')}: busca no banco encerrada`);
  if (!busca.length) {
    if (!sync.faltam.length) vivo('fim', 'Aba Massa já tem massa válida para os cenários: banco não consultado');
    return { ok: true, travado: true };
  }
  cens = busca.filter((c) => estado(dir).massaDesfecho?.[c.id]?.tipo !== 'dispensa');
  if (!cens.length) return { ok: true };
  mudar(dir, { etapa: 'massa', massaFase: 'buscar' });
  const b = d.banco,
    liberado = b && require('../../../../infra/agentes/banco').liberado(b),
    mapa = liberado ? vagas.raiz('impl.mapa') || '' : '';
  const rodar = (cs, fase, titulo, timeoutMin) => {
    mudar(dir, { massaFase: fase });
    const escreve = fase === 'produzir' && liberado;
    return claude(
      dir,
      {
        prompt: promptMassa(
          d.chave,
          cs,
          dir,
          b ? require('../../../../infra/agentes/banco').texto(b) : '',
          mapa,
          escreve,
          naAba,
          fase
        ),
        titulo,
        cwd: amb.backend || d.backend,
        ferramentas: FERRAMENTAS_MASSA(mapa),
        env: {
          ...(mapa ? require('../../../../infra/agentes/banco').env(b, dir) : {}),
          ...(escreve ? { QA_BANCO_ESCRITA: '1' } : {})
        }
      },
      { ...d, timeoutMin }
    );
  };
  const faltam = () =>
    cens.filter((c) => !estado(dir).massaDesfecho?.[c.id] && semMassa(dir, [c.id], new Date(), d.horaRefresh).length);
  try {
    // Fase 1: busca por até 5 min (só leitura). Fase 2: produzir a massa por UPDATE (o humano aprova). Sem jeito: desiste do cenário e segue para o próximo.
    const r1 = await rodar(cens, 'buscar', 'QA · Levantando massa de dados', d.massaBuscaMin ?? MASSA_BUSCA_MIN);
    if (r1.erro || absorverPausa(dir) || estado(dir).pausa || pausado(dir)) return r1;
    const sem = faltam();
    if (!sem.length) return r1;
    vivo(
      'aviso',
      `Massa não encontrada em ${d.massaBuscaMin ?? MASSA_BUSCA_MIN} min para ${sem.map((c) => c.id).join(', ')}: tentando produzir por UPDATE`
    );
    if (!liberado) {
      for (const c of sem)
        desistirMassa(dir, c.id, 'banco não configurado ou em produção: não dá para produzir a massa por UPDATE');
      return r1;
    }
    const r2 = await rodar(sem, 'produzir', 'QA · Produzindo massa por UPDATE', d.timeoutMin);
    for (const c of cens)
      if (estado(dir).massaDesfecho?.[c.id]?.tipo === 'desistiu')
        vivo(
          'aviso',
          `${c.id}: sem massa e sem UPDATE possível (${estado(dir).massaDesfecho[c.id].nota}); seguindo para o próximo`
        );
    return r2;
  } finally {
    mudar(dir, { etapa: null, massaFase: null });
  }
}

module.exports = { n: 5, levantarMassa, MASSA_BUSCA_MIN };
