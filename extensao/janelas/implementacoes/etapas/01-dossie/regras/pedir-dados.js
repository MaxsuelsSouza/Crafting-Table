// @ts-check
// "Pedir mais dados no Jira" (pausa 'aguardando-dados'): o ÚNICO ponto da reprodução que escreve na ferramenta de tickets.
//   1. rascunhar   a IA escreve comentario-jira.md a partir das lacunas; a pausa mostra o rascunho (texto livre = trocar o rascunho)
//   2. publicar    SÓ com o botão Publicar (aprovação do dev): provedor.comentar; guarda repro.pedido = { id, em }
//   3. aoAtualizar no ⟳ do painel: comentário de outra pessoa depois do nosso → volta para a 1.2 (relê o ticket com a resposta)
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const prompts = require('../../../prompts');
const { promptPedido, RASCUNHO } = require('../reproducao/prompt-pedido');
const { EVIDENCIAS_MD } = require('../reproducao/evidencias-ticket');
const { reiniciar } = require('../reproducao/resultado');
const { SEM_CONFIRMAR, TENTAR, estado, mudar, pausar } = require('../../../estado');
const { limparPausa } = require('../../../orquestrador/pausa');
const { LEITURA_REPRO } = require('./ferramentas');
const { claude } = require('./claude');
const { deps } = require('../dependencias');

const PEDIR = 'Pedir mais dados no Jira',
  PUBLICAR = 'Publicar o comentário no ticket',
  MOTIVO = 'aguardando-dados';
const ler = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, RASCUNHO), 'utf8').trim();
  } catch {
    return '';
  }
};
const pausarRascunho = (dir, md) =>
  pausar(dir, 1, {
    motivo: MOTIVO,
    pergunta: md
      ? `Rascunho do comentário para o ticket (nada foi publicado). Revise: "${PUBLICAR}" publica este texto; escrever outro texto troca o rascunho.\n\n${md}`
      : `A IA não deixou rascunho. Escreva o comentário que devo publicar no ticket (nada foi publicado).`,
    opcoes: md ? [PUBLICAR, TENTAR, SEM_CONFIRMAR] : [TENTAR, SEM_CONFIRMAR]
  });

async function rascunhar(s, t, motivo) {
  const dir = s.pastaAba(t.id);
  fs.rmSync(path.join(dir, RASCUNHO), { force: true });
  limparPausa(dir);
  mudar(dir, { etapa: 1, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Reprodução · rascunho do pedido de mais dados' });
  s.render();
  await claude(s, t, {
    prompt: promptPedido({ dir, t, gravar: prompts.GRAVAR, motivo }),
    titulo: 'Esteira · Reprodução: pedido de dados',
    ferramentas: LEITURA_REPRO()
  });
  limparPausa(dir);
  pausarRascunho(dir, ler(dir));
  s.render();
}

/** Resposta à pausa 'aguardando-dados'. Botão Publicar → comenta; texto livre (antes de publicar) → vira o rascunho. */
async function responderPedido(s, t, r) {
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (e.pausa?.publicado) return false;
  if (r !== PUBLICAR) {
    fs.writeFileSync(path.join(dir, RASCUNHO), `${r}\n`);
    pausarRascunho(dir, r);
    return true;
  }
  const md = ler(dir);
  if (!md) return true;
  let res;
  try {
    res = await deps.comentar(s, t, md);
  } catch (x) {
    aoVivo.anotar(dir, {
      tipo: 'erro',
      texto: `Não consegui publicar o comentário: ${/** @type {any} */ (x).message}`
    });
    pausarRascunho(dir, md);
    return true;
  }
  const pedido = { id: String(res?.id || ''), em: res?.created || new Date().toISOString() };
  mudar(dir, { repro: { ...(estado(dir).repro || {}), pedido } });
  aoVivo.anotar(dir, { tipo: 'fim', texto: 'Comentário publicado no ticket pedindo mais dados' });
  pausar(dir, 1, {
    motivo: MOTIVO,
    publicado: true,
    pergunta:
      'Comentário publicado no ticket. Quando houver resposta, clique em ⟳ atualizar: a reprodução recomeça da 1.2 com os dados novos.',
    opcoes: [TENTAR, SEM_CONFIRMAR]
  });
  return true;
}

/** ⟳ do painel: comentário de outra pessoa depois do nosso → volta para a 1.2. true = voltou. */
async function aoAtualizar(s, t) {
  const dir = s.pastaAba(t.id),
    e = estado(dir),
    pedido = e.repro?.pedido;
  if (e.pausa?.motivo !== MOTIVO || !e.pausa.publicado || !pedido) return false;
  let novos = [];
  try {
    novos = (await deps.comentarios(s, t)).filter(
      (c) => c.id !== pedido.id && Date.parse(c.data) > Date.parse(pedido.em)
    );
  } catch {
    return false;
  }
  if (!novos.length) return false;
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Resposta no ticket (${novos.at(-1).autor}): a reprodução recomeça da 1.2`
  });
  voltarParaEvidencias(dir);
  if (s.cacheJira) delete s.cacheJira[t.id];
  await require('../../../orquestrador/seguir').seguir(s, t); // ciclo: seguir → 01-dossie → aqui
  return true;
}

/** Recomeça a reprodução da 1.2: o ticket é relido, o roteiro é refeito (o fluxo anterior fica guardado). */
function voltarParaEvidencias(dir) {
  fs.rmSync(path.join(dir, EVIDENCIAS_MD), { force: true });
  reiniciar(dir);
  const r = estado(dir).repro || {};
  mudar(dir, { pausa: null, etapa: 1, fase: 'parado', reproducao: undefined, repro: { head: r.head } });
}

module.exports = { PEDIR, PUBLICAR, MOTIVO, rascunhar, responderPedido, aoAtualizar, voltarParaEvidencias };
