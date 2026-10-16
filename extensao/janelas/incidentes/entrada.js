// @ts-check
// Entrada do incidente (entrada.json/md na pasta da aba): o que o ticket traz para investigar, com a confiança de cada fonte.
// Montada no começo da etapa 1 (etapas/01-triagem.js); o prompt de todas as etapas a cita e o orquestrador decide por ela se as etapas 1 a 3
// pedem aprovação (exigeAprovacaoInicial). Mesma régua do dossiê da Implementação (infra/dossie/: NIVEIS, LIMIAR_TEXTO, capacidades),
// eixos próprios: relato (o que aconteceu), evidencia (anexos) e ambiente (banco e código).
const fs = require('fs');
const path = require('path');
const tickets = require('../../infra/ticket/tickets');
const { sobreTicket, capacidadesDe, nivelDe, rank, paraMarkdown } = require('../../infra/dossie');

/** @typedef {import('../../infra/dossie').Item} Item */
const ENTRADA = { json: 'entrada.json', md: 'entrada.md' };
const ROTULO_MODO_INC = { investigar: 'Investigar (há relato do incidente)', perguntar: 'Perguntar (só o título)' };
const ROTULO_EIXO_INC = {
  relato: 'Relato: o que aconteceu',
  evidencia: 'Evidências anexadas',
  ambiente: 'Ambiente: banco e código'
};

/**
 *   modo: investigar (há relato: do ticket, documento ou explicado pelo dev/PO) · perguntar (só o título)
 *   prontidão alta (relato do ticket ou documento): as etapas 1 a 3 seguem sozinhas; abaixo disso cada uma pede aprovação. A 4 pede sempre.
 * @param {any} t ticket local  @param {{ j?: any, obsPO?: string, banco?: { conexao?: string, ambiente?: string }, repos?: any[] }} [o]
 */
function montarIncidente(t, o = {}) {
  /** @type {{ relato: Item[], evidencia: Item[], ambiente: Item[] }} */
  const eixos = { relato: [], evidencia: [], ambiente: [] };
  /** @type {string[]} */ const lacunas = [];
  const tk = sobreTicket(t, o.j),
    anexos = (o.j?.anexos || []).length,
    pasta = tickets.pasta(t.chave);
  const extras = (() => {
    try {
      return fs.readdirSync(path.join(pasta, '.anexos')).length;
    } catch {
      return 0;
    }
  })();
  const fontes = {
    ticket: { texto: tk.caracteres, documento: tk.temDoc, comentarios: (o.j?.comentarios || []).length },
    anexos: anexos + extras,
    obsPO: !!String(o.obsPO || '').trim()
  };
  if (tk.suficiente)
    eixos.relato.push({
      fonte: 'ticket',
      rotulo: tk.temDoc ? 'Documento do incidente' : 'Descrição e comentários do ticket',
      confianca: 'bruto',
      detalhe: tk.temDoc ? path.basename(/** @type {string} */ (tk.doc)) : `${tk.caracteres} caracteres`,
      ...(tk.temDoc ? { arquivo: tk.doc } : {})
    });
  if (fontes.obsPO) eixos.relato.push({ fonte: 'obsPO', rotulo: 'Explicação do dev/PO (verbal)', confianca: 'verbal' });
  if (!eixos.relato.length) lacunas.push('O ticket não tem descrição nem documento suficientes: só o título.');
  if (anexos + extras)
    eixos.evidencia.push({ fonte: 'anexos', rotulo: `Anexos do ticket (${anexos + extras})`, confianca: 'bruto' });
  else lacunas.push('Sem anexos (prints, vídeos, logs): o relato é a única evidência.');
  const cap = capacidadesDe(o, lacunas);
  eixos.ambiente.push({
    fonte: 'banco',
    rotulo: cap.banco === 'leitura' ? 'Banco em leitura (mapa-db)' : 'Banco indisponível',
    confianca: cap.banco === 'leitura' ? 'gerado' : 'ausente'
  });
  const niveis = {
    relato: nivelDe(eixos.relato),
    evidencia: nivelDe(eixos.evidencia),
    ambiente: nivelDe(eixos.ambiente)
  };
  const prontidao =
    rank(niveis.relato) >= rank('bruto') ? 'alta' : rank(niveis.relato) >= rank('verbal') ? 'media' : 'baixa';
  return {
    versao: 1,
    ticket: t.chave,
    titulo: t.titulo || t.documento?.nome || '',
    gerado: new Date().toISOString(),
    eixos,
    niveis,
    fontes,
    prontidao,
    modo: rank(niveis.relato) >= rank('verbal') ? 'investigar' : 'perguntar',
    lacunas,
    capacidades: { banco: cap.banco, repos: cap.repos, semBranch: cap.semBranch },
    exigeAprovacaoInicial: prontidao !== 'alta'
  };
}

/** Grava entrada.json e entrada.md do Incidente em <dir>. */
function gravarEntrada(dir, d) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ENTRADA.json), JSON.stringify(d, null, 2));
  fs.writeFileSync(
    path.join(dir, ENTRADA.md),
    paraMarkdown(d, { eixos: ROTULO_EIXO_INC, modos: ROTULO_MODO_INC, nome: 'Entrada do incidente' })
  );
}
const lerEntrada = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, ENTRADA.json), 'utf8'));
  } catch {
    return null;
  }
};

module.exports = { ENTRADA, ROTULO_MODO_INC, montarIncidente, gravarEntrada, lerEntrada };
