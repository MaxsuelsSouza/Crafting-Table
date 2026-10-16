// @ts-check
// 3.2 Plano técnico: lê os mapas, escreve plan.md e roda concluir 3.
const { pasta } = require('../../../../infra/pasta-ticket');
const { anotar } = require('../../../../componentes/ao-vivo');
const { dirSpec, ticketDe, estadoSpec } = require('../../../locais');
const { estadoDe } = require('../../../estado');
const { s } = require('../../../orquestrador/servicos');
const { etapa } = require('../../../orquestrador/etapa');
const { pedirMemoria } = require('../../../orquestrador/memoria');
const { conferir } = require('../../../orquestrador/conferir');
const { gravarSub3 } = require('./estado');

// mapas = os da 3.1 em disco. Devolve o que a etapa devolveu (true = começou); sem mapas, erro e false.
const rodar = (t, titulo, extra, mapas) => {
  if (!mapas.length) {
    gravarSub3(t.chave, { mapa: 'erro' });
    anotar(pasta(t.chave), {
      tipo: 'erro',
      texto: 'Passo 3.2 não começou: o mapeamento (3.1) não deixou mapa-backend.md nem mapa-mobile.md na pasta da spec',
      detalhe: `Procurei em ${dirSpec(t)}. Continue o refinamento para refazer o mapeamento.`
    });
    s.render();
    return false;
  }
  gravarSub3(t.chave, { plano: 'rodando' });
  const ok = etapa(
    t,
    `Siga a skill sdd, protocolo de retomada, sem perguntar. Passo 3 (${titulo}), SUBETAPA 3.2 · PLANO TÉCNICO. O mapeamento do código (3.1) já foi feito: NÃO o refaça. Leia ${mapas.join(' e ')} e a spec, ` +
      'escreva o plan.md (com "## Mapeamento do código" resumindo os mapas e "## Conformidade com a Constituição") e rode concluir 3. Só consulte o código para tirar uma dúvida pontual.' +
      extra +
      pedirMemoria(t, 3, false),
    false,
    undefined,
    `Passo 3.2 · Plano técnico`,
    () => fimPlano(t)
  );
  if (!ok) gravarSub3(t.chave, { plano: 'pendente' });
  return ok;
};
const fimPlano = (t) => {
  const p = estadoSpec(ticketDe(t.chave) || t)?.passos[3];
  const feito = ['aguardando_revisao', 'aprovado'].includes(p?.status),
    pausado = estadoDe(t.chave) !== 'rodando';
  gravarSub3(t.chave, { plano: feito ? 'concluida' : pausado ? 'pausada' : 'erro' });
  conferir(t, 3); // sem concluir, artefato curto ou sem as seções: correção limitada e, esgotada, pausa com o motivo
};

module.exports = { rodar, fimPlano };
