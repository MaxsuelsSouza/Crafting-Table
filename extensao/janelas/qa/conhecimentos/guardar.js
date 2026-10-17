// @ts-check
// Gravar, corrigir e apagar conhecimentos. Mesma chave e tipo = atualiza (não duplica). Flow guarda também o .yaml em flows/.
const fs = require('fs');
const path = require('path');
const { TIPOS, FLOWS, ler, gravar, chaveAtual } = require('./arquivo');

const normal = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();
const proximoId = (itens) =>
  `K${String(itens.reduce((m, i) => Math.max(m, Number(String(i.id).slice(1)) || 0), 0) + 1).padStart(3, '0')}`;

/** @param {{ tipo: string, chave: string, titulo?: string, conteudo?: string, fonte?: string, sha?: string, arquivo?: string }} o */
function adicionar(o) {
  if (!TIPOS[o.tipo]) throw new Error(`tipo inválido: use ${Object.keys(TIPOS).join(', ')}`);
  if (!String(o.chave || '').trim())
    throw new Error('--chave é obrigatória (ex.: SFC.WMSPEDIDO, login.botaoEntrar, inicio)');
  o = { ...o, chave: chaveAtual(o.tipo, o.chave) };
  let conteudo = String(o.conteudo || '');
  if (o.arquivo) conteudo = fs.readFileSync(o.arquivo, 'utf8');
  if (!conteudo.trim()) throw new Error('--conteudo (ou --arquivo) é obrigatório');
  const d = ler(),
    agora = new Date().toISOString();
  let item = d.itens.find((i) => i.tipo === o.tipo && normal(i.chave) === normal(o.chave));
  if (item)
    Object.assign(item, {
      titulo: o.titulo || item.titulo,
      conteudo,
      fonte: o.fonte || item.fonte,
      sha: o.sha || item.sha,
      atualizado: agora
    });
  else {
    item = {
      id: proximoId(d.itens),
      tipo: o.tipo,
      chave: String(o.chave).trim(),
      titulo: o.titulo || String(o.chave).trim(),
      conteudo,
      fonte: o.fonte || '',
      sha: o.sha || '',
      em: agora,
      atualizado: agora,
      usos: 0
    };
    d.itens.push(item);
  }
  if (o.tipo === 'flow') {
    fs.mkdirSync(FLOWS(), { recursive: true });
    item.arquivo = path.join(FLOWS(), `${String(o.chave).replace(/[^\w-]/g, '-')}.yaml`);
    fs.writeFileSync(item.arquivo, conteudo);
  }
  gravar(d);
  return item;
}

function apagar(id) {
  const d = ler(),
    item = d.itens.find((i) => i.id === id);
  if (!item) return false;
  if (item.arquivo) fs.rmSync(item.arquivo, { force: true });
  gravar({ ...d, itens: d.itens.filter((i) => i.id !== id) });
  return true;
}

function marcarUso(ids) {
  const d = ler(),
    agora = new Date().toISOString();
  let mudou = false;
  for (const i of d.itens)
    if (ids.includes(i.id)) {
      i.usos = (i.usos || 0) + 1;
      i.ultimoUso = agora;
      mudou = true;
    }
  if (mudou) gravar(d);
}

const definirTelaInicio = (nome) => gravar({ ...ler(), telaInicio: String(nome || '').trim() });

module.exports = { adicionar, apagar, marcarUso, definirTelaInicio };
