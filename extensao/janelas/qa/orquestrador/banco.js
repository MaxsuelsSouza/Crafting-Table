// @ts-check
// Banco do QA nesta execução: o MCP do SQLcl (uma sessão aberta, ~0,1 s por consulta) é o padrão; o mapa-db antigo
// (um SQLcl por consulta, ~10 s) é a reserva e só entra com a confirmação do humano.
// prepararBanco: no ▶, testa o MCP e marca d.banco.modo ('mcp' | 'antigo'). bancoDaSessao: o que a sessão da IA recebe (claude.js).
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const vagas = require('../../../infra/agentes/etapas');
const bancoIA = require('../../../infra/agentes/banco');
const mcp = require('../../../infra/agentes/mcp-sqlcl');

const confirmados = new Set(); // pastas em que o humano aceitou o modo antigo (vale até fechar o VS Code)

async function prepararBanco(dir, d) {
  const b = d.banco,
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  if (!b || !bancoIA.liberado(b)) return true; // sem banco configurado: os prompts já dizem para não consultar
  const s = await (d.saudeBanco || mcp.saude)(b); // d.saudeBanco: os testes trocam a ida ao MCP
  if (s.ok) {
    d.banco = { ...b, modo: 'mcp' };
    vivo('acao', `Banco pelo MCP do SQLcl: ${s.base} (${(s.ms / 1000).toFixed(1)} s para abrir a sessão)`);
    return true;
  }
  const ok =
    confirmados.has(dir) ||
    (await d.confirmar?.(
      `O MCP do SQLcl não respondeu (${s.erro}). Usar o modo antigo (mapa-db), mais lento: ~10 s por consulta?`
    ));
  if (!ok) {
    vivo('aviso', `MCP do SQLcl fora (${s.erro}) e o modo antigo não foi autorizado: QA não iniciado`);
    return false;
  }
  confirmados.add(dir);
  d.banco = { ...b, modo: 'antigo' };
  vivo('aviso', `Banco pelo modo antigo (mapa-db, ~10 s por consulta): você autorizou. MCP: ${s.erro}`);
  return true;
}

/** escreve: a IA faz UPDATE (com WHERE) direto pelo MCP; no modo antigo (mapa-db, só leitura) a escrita segue pela proposta aprovada.
 * @returns {{ ferramentas: string[], proibidas: string[], extras: string[], env: Record<string,string>, hooks: object|null, texto: string, escreve?: boolean }} */
function bancoDaSessao(dir, d) {
  const b = d.banco,
    nada = { ferramentas: [], proibidas: [], extras: [], env: {}, hooks: null };
  if (!b || !bancoIA.liberado(b)) return { ...nada, texto: bancoIA.texto(b || {}) };
  const amb = b.ambiente === 'qas' ? 'QAS' : 'cópia de produção',
    // o qa-state receita roda as buscas pelo mesmo caminho (MCP ou, autorizado, o mapa-db)
    QA_BANCO = JSON.stringify({
      conexao: b.conexao,
      ambiente: b.ambiente,
      sqlcl: b.sqlcl,
      sensiveis: b.sensiveis,
      modo: b.modo
    });
  if (b.modo === 'antigo') {
    const mapa = vagas.raiz('impl.mapa') || '';
    return {
      ...nada,
      ferramentas: mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : [],
      env: { ...bancoIA.env(b, dir), QA_BANCO },
      texto: `configurado (${amb}), modo antigo: consulte SOMENTE por ${mapa}/bin/mapa-db consulta "<SELECT>" (~10 s cada; junte várias em ${mapa}/bin/mapa-db lote <arquivo.sql>)`
    };
  }
  const c = mcp.paraClaude(b);
  // CT_CONHECIMENTOS: o hook devolve a tabela que já está nos Conhecimentos em vez de deixar consultar o dicionário de novo.
  // QA_LOG_SQL: o hook anota cada UPDATE da IA no log de escritas (o relatório lista em "Escritas no banco").
  return {
    ...c,
    env: {
      ...c.env,
      QA_BANCO,
      CT_CONHECIMENTOS: require('../conhecimentos').ARQ(),
      QA_LOG_SQL: path.join(dir, require('../etapas/05-massa/proposta').LOG_SQL)
    },
    escreve: true,
    texto: `configurado (${amb}) ${c.texto}`
  };
}

module.exports = { prepararBanco, bancoDaSessao };
