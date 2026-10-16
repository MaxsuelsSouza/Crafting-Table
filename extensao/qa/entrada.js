// @ts-check
// Entrada do QA: o dossiê do ticket (o mesmo da Implementação: infra/dossie/) mais o que a Implementação entregou e o que o dev explicou.
// Só lê arquivos (sem vscode, sem IA). Grava dossie.json e dossie.md na pasta qa/ para o Claude e a aba. Ticket só com título não vira plano
// inventado: devolve a pergunta que a extensão faz ao dev (briefing).
const fs = require('fs');
const path = require('path');
const dossie = require('../infra/dossie');

const BRIEFING = '.briefing.md';
const existe = (f) => {
  try {
    return fs.statSync(f).size > 0;
  } catch {
    return false;
  }
};

/**
 * @param {any} t ticket local (chave, documento?, …)
 * @param {string} dir pasta qa/ do ticket
 * @param {any} [j] ticket normalizado do provedor (descrição e comentários)
 * @returns {{ d: any, pergunta: string }} pergunta vazia = pode planejar
 */
function preparar(t, dir, j) {
  const d = dossie.montar(t, { j: j && !j.erro ? j : undefined });
  const impl = path.join(path.dirname(dir), 'impl');
  const resumo = path.join(impl, 'implementacao.md'),
    verif = path.join(impl, 'verificacao.json');
  if (existe(resumo))
    d.eixos.alvo.push({
      fonte: 'implementacao',
      rotulo: 'Resumo da implementação (o que mudou e como validar)',
      confianca: 'gerado',
      arquivo: resumo
    });
  if (existe(verif))
    d.eixos.pronto.push({
      fonte: 'verificacao',
      rotulo: 'Verificação automática da implementação (build e testes)',
      confianca: 'gerado',
      arquivo: verif
    });
  const briefing = path.join(dir, BRIEFING);
  if (existe(briefing))
    d.eixos.alvo.push({
      fonte: 'briefing-qa',
      rotulo: 'Explicação do dev para o QA (verbal)',
      confianca: 'verbal',
      arquivo: briefing
    });
  d.niveis.alvo = dossie.nivelDe(d.eixos.alvo);
  d.niveis.pronto = dossie.nivelDe(d.eixos.pronto);
  const semAlvo = d.niveis.alvo === 'ausente';
  if (!semAlvo && d.modo === 'perguntar') d.modo = 'entender';
  if (semAlvo) d.modo = 'perguntar';
  dossie.gravar(dir, d);
  return {
    d,
    pergunta: semAlvo
      ? 'O ticket não tem descrição, documento, refinamento nem implementação: só o título. Explique o que deve ser testado (comportamento esperado, regras, perfis, o que não pode quebrar). O que você escrever vira a fonte "verbal" do plano.'
      : ''
  };
}

module.exports = { preparar, BRIEFING };
