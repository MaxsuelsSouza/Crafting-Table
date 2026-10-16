// @ts-check
// Etapa 5 · Massa de dados (.massa.json, aba Massa). Com a receita do 6.0 Gerar (receita/): buscas sem IA, UPDATEs num lote só para aprovar.
// Sem receita (o caminho antigo): a IA busca só leitura por até 5 min, depois produz por UPDATE (o humano aprova), senão desiste e segue.
//   receita/             formato, buscar e distribuir, produzir, levantar (com a correção pela conversa do Gerar)
//   estado.js            .massa.json, massa add/estado e a janela da etapa (emEtapaMassa)
//   regras/validade.js   validade até o refresh do banco e a sincronia com a aba Massa
//   regras/sql.js        o que um lote de alteração pode ter (só INSERT/UPDATE/DELETE com WHERE)
//   dependencias.js      executar o lote no SQLcl
//   prompt.js            prompt da busca e da produção, ferramentas
//   proposta.js          lote SQL proposto pela IA: aprovar, recusar, desfazer
//   desistir.js          sem massa e sem UPDATE possível: bloqueia o cenário e segue
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { claude } = require('../../orquestrador/claude');
const { absorverPausa } = require('../../orquestrador/pausa');
const { sincronizarMassa, semMassa, ultimoRefresh } = require('./regras/validade');
const { MASSA_BUSCA_MIN, promptMassa } = require('./prompt');
const { bancoDaSessao } = require('../../orquestrador/banco');
const { desistirMassa } = require('./desistir');

// Etapa 4: o Claude levanta massa para os cenários dados. `etapa: 'massa'` no estado libera o `qa-state massa add` só durante ela.
// Trava de banco: relê a aba antes; só vai ao banco quem não tem massa válida lá.
async function levantarMassa(dir, d, amb, cens) {
  const sync = sincronizarMassa(
    dir,
    cens.map((c) => c.id),
    new Date(),
    d.horaRefresh
  );
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const naAba = Object.values(sync.validas).flat();
  // Massa consumida conta como inválida: o cenário vai ao banco atrás de outra (regra "massa inválida → renovar").
  const busca = cens.filter((c) => sync.faltam.includes(c.id));
  if (!busca.length) {
    if (!sync.faltam.length) vivo('fim', 'Aba Massa já tem massa válida para os cenários: banco não consultado');
    return { ok: true, travado: true };
  }
  cens = busca.filter((c) => estado(dir).massaDesfecho?.[c.id]?.tipo !== 'dispensa');
  if (!cens.length) return { ok: true };
  // Receita escrita no 6.0 Gerar: a massa sai das buscas dela, sem IA (a IA só volta para corrigir a receita).
  if (require('./receita').temReceita(dir)) return require('./receita/levantar').levantarPorReceita(dir, d, amb, cens);
  mudar(dir, { etapa: 'massa', massaFase: 'buscar' });
  const b = d.banco,
    liberado = b && require('../../../../infra/agentes/banco').liberado(b);
  const rodar = (cs, fase, titulo, timeoutMin) => {
    mudar(dir, { massaFase: fase });
    const escreve = fase === 'produzir' && liberado,
      bk = bancoDaSessao(dir, d); // bk.escreve: MCP, a IA faz o UPDATE (com WHERE) direto
    return claude(
      dir,
      {
        prompt: promptMassa(d.chave, cs, dir, bk.texto, '', escreve, naAba, fase, !!bk.escreve),
        titulo,
        cwd: amb.backend || d.backend,
        banco: true, // MCP do SQLcl (ou o mapa-db, se o humano autorizou); Bash livre como nas outras etapas
        env: escreve ? { QA_BANCO_ESCRITA: '1' } : {}
      },
      { ...d, timeoutMin }
    );
  };
  const faltam = () =>
    cens.filter((c) => !estado(dir).massaDesfecho?.[c.id] && semMassa(dir, [c.id], new Date(), d.horaRefresh).length);
  try {
    // Fase 1: busca por até 5 min (só leitura). Fase 2: produzir a massa por UPDATE (o humano aprova). Sem jeito: desiste do cenário e segue para o próximo.
    // A fase 1 que já não achou nada hoje (desde o refresh) não se repete: o cenário vai direto para a fase 2.
    const vazias = estado(dir).buscaVazia || {},
      jaBuscou = (c) => vazias[c.id] && new Date(vazias[c.id]) >= ultimoRefresh(new Date(), d.horaRefresh),
      buscar = cens.filter((c) => !jaBuscou(c));
    if (buscar.length < cens.length)
      vivo(
        'acao',
        `Busca de massa já feita hoje sem resultado para ${cens
          .filter(jaBuscou)
          .map((c) => c.id)
          .join(', ')}: indo direto para produzir`
      );
    const r1 = buscar.length
      ? await rodar(buscar, 'buscar', 'QA · Levantando massa de dados', d.massaBuscaMin ?? MASSA_BUSCA_MIN)
      : { ok: true };
    if (r1.erro || absorverPausa(dir) || estado(dir).pausa || pausado(dir)) return r1;
    const sem = faltam();
    const agora = new Date().toISOString();
    mudar(dir, {
      buscaVazia: {
        ...vazias,
        ...Object.fromEntries(sem.filter((c) => buscar.includes(c)).map((c) => [c.id, agora]))
      }
    });
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
