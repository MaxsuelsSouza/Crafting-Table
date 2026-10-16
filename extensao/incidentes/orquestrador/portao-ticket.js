// @ts-check
// Portão das etapas que leem o ticket (leTicket): relê o ticket, exige os anexos baixados e o ticket legível.
// Para toda etapa, grava o .jira-contexto.md com o ticket em texto.
const fs = require('fs');
const path = require('path');
const controle = require('../../infra/controle');
const { CONTEXTO, OPCOES } = require('../estado');
const { ehDocumento } = require('../prompt');
const { pausar } = require('./pausar');

// Descrição, subtarefas e comentários (e o documento, se o ticket for um) em texto, para o Claude ler sem depender de outra ferramenta.
const contextoJira = (j, t) => require('../../infra/contexto').contextoDoTicket(j, t);

// Anexos do Jira ainda não baixados (mesma conta da aba Docs).
const anexosFaltando = (s, t) => {
  if (ehDocumento(t)) return []; // ticket-documento: o original e os extras já estão na pasta (.origem.json); nada a baixar
  const { ler, ORIGEM } = require('../../refinamento/locais');
  return require('../../componentes/aba-docs').pendentes(
    s.cacheJira[t.id]?.anexos,
    ler(path.join(s.pasta(t.id), ORIGEM), {})
  );
};

// Devolve { parar: true } quando a etapa não deve rodar (rodada cancelada ou pausa já gravada) ou { j } com o ticket lido.
const portaoTicket = async (s, t, dir, n, rodada, et) => {
  if (et.leTicket) {
    // todos os anexos do ticket precisam estar baixados
    if (ehDocumento(t)) {
      // fonte local: extrai texto/páginas e usa o buscar local (sem rede)
      await require('../../infra/contexto').prepararDocumento(t);
      s.cacheJira[t.id] = require('../../provedores/documento').buscarSync({ key: t.chave });
    } else if (!s.cacheJira[t.id] && s.atualizarJira) await s.atualizarJira(t.id);
    if (!controle.valida(dir, rodada)) return { parar: true };
    const falta = anexosFaltando(s, t);
    if (falta.length) {
      pausar(s, dir, n, {
        motivo: 'anexos',
        pergunta: `${falta.length} anexo(s) do ticket ainda não foram baixados (${falta.map((a) => a.nome).join(', ')}). Baixe e continue.`,
        aviso: 'Mergulho pausado: faltam anexos do ticket para baixar'
      });
      return { parar: true };
    }
  }
  const j = s.cacheJira[t.id];
  if (et.leTicket && j?.erro) {
    // não segue com um .jira-contexto.md velho: o Claude investigaria o incidente errado
    pausar(s, dir, n, {
      motivo: 'ticket',
      pergunta: `Não consegui ler o ticket: ${String(j.erro).slice(0, 160)}. Verifique a conexão com a ferramenta de tickets e tente de novo.`,
      opcoes: [OPCOES.TENTAR],
      aviso: 'Mergulho pausado: não foi possível ler o ticket'
    });
    return { parar: true };
  }
  if (j && !j.erro) fs.writeFileSync(path.join(dir, CONTEXTO), contextoJira(j, t));
  return { j };
};

module.exports = { portaoTicket, anexosFaltando };
