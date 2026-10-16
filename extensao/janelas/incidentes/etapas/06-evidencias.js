// @ts-check
// Etapa 6 · Evidências: o Resumo Analítico do incidente (resumo.md) para o PO, e o Mergulho concluído.
// Roda como fecho da etapa 5 (05-reproducao.js chama fechar com as mesmas dependências). Sem resumo do Claude, a extensão monta um básico
// com aviso no topo. A tela é a aba Evidências (abas/evidencias.js).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { documentos } = require('./index');
const { mesclar, lerJson, lerTxt, ESTADO } = require('../estado');
const { REGRAS_5E6 } = require('../prompt');

const promptResumo = (chave, dir) =>
  `[segundo plano · Crafting Table · Incidente ${chave}] Escreva em ${path.join(dir, 'resumo.md')} o Resumo Analítico do incidente, em português, texto corrido e objetivo para o PO. ` +
  `Leia ${documentos(dir)}, ${path.join(dir, 'reproducao.json')} e as observações do PO em ${path.join(dir, ESTADO)} (campo obsPO). Consolide: descrição do ticket, etapa do fluxo onde falhou, a tentativa do usuário, o que os logs mostram, os comentários/observações do PO e o resultado da reprodução no emulador. ` +
  'Adapte ao caso (ex.: "Após analisar as evidências e os logs, identificamos que em [data] às [hora], ao tentar [ação] no registro [ID], a etapa [etapa] do fluxo [fluxo] falhou porque…"), sem formulário fixo. Não invente: o que não consta nos arquivos vira "não identificado". ' +
  `${REGRAS_5E6}`;

// Resumo mínimo, se o Claude não gravar o resumo.md.
const resumoBasico = (dir, t) => {
  const r = lerJson(path.join(dir, 'reproducao.json'), {}),
    diag = lerTxt(path.join(dir, '4-diagnostico.md')).trim(),
    tri = lerTxt(path.join(dir, '1-triagem.md')).trim();
  return `# Resumo analítico · ${t.chave}\n\n${tri ? `${tri}\n\n` : ''}${diag ? `## Diagnóstico\n\n${diag}\n\n` : ''}## Reprodução no emulador\n\n${r.ok ? 'O problema foi reproduzido.' : 'O problema não foi reproduzido.'} ${r.acao || ''}\n`;
};

// d.claude: o mesmo runner da etapa 5 (injetável nos testes); ponto(): lança se a rodada foi pausada.
async function fechar(t, dir, d, ponto) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'Incidente · 6. Resumo analítico');
  ponto();
  await d.claude({ prompt: promptResumo(t.chave, dir), titulo: 'Incidente · Escrevendo o resumo analítico' });
  if (!lerTxt(path.join(dir, 'resumo.md')).trim()) {
    fs.writeFileSync(
      path.join(dir, 'resumo.md'),
      `> Resumo montado pela extensão, sem IA: o Claude não gravou o resumo.md. Revise antes de usar.\n\n${resumoBasico(dir, t)}`
    );
    vivo('aviso', 'O Claude não gravou o resumo.md: a extensão montou um resumo básico (revise)');
  }
  mesclar(dir, { etapa: 6, fase: 'concluido', pausa: null });
  vivo('fim', 'Mergulho concluído: veja a aba Evidências');
}

module.exports = { n: 6, fechar, promptResumo, resumoBasico };
