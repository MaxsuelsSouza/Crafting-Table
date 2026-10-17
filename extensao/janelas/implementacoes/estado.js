// @ts-check
// Estado da esteira de Implementação em <aba>/.esteira.json (etapa, fase, pausa, aprovacao, tentativas, correcao, branches, bases, modo, reproducao,
// syncOk, host; no pai com subtarefas: subtarefas, planoAprovado, integrado, verificadoFinal; no grupo: iniciado, worktree), a situação única da tela, a pausa e os textos das opções que a extensão resolve sozinha. Comum a todas as etapas e às abas.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../componentes/ao-vivo');
const maestro = require('../../infra/agentes/maestro');
const { filhos } = require('./dependencias');
const { etapa } = require('./etapas');

const ESTADO = '.esteira.json';
const PAUSA = '.pausa.json',
  PAUSA_MD = '.pausa.md',
  RESPOSTAS = '.respostas.md',
  CONTEXTO = '.contexto-ticket.md';
const SEM_CONFIRMAR = 'Seguir sem confirmar o erro';
const TENTAR = 'Tentar de novo',
  SEGUIR = 'Continuar assim mesmo',
  CORRIGIR = 'Tentar corrigir mais uma vez',
  RESUMIR = 'Seguir para o resumo assim mesmo',
  REPETIR = 'Rodar a implementação de novo',
  VERIFICAR = 'Seguir para a verificação';
const lerJson = (arq, vazio) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return vazio;
  }
};

const estado = (dir) => ({
  etapa: 1,
  fase: 'parado',
  pausa: null,
  aprovacao: null,
  tentativas: 0,
  correcao: false,
  branches: {},
  ...lerJson(path.join(dir, ESTADO), {})
});
const mudar = (dir, patch) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ESTADO),
    JSON.stringify(
      {
        ...estado(dir),
        ...patch,
        ...(patch.fase === 'rodando' ? { host: process.pid } : {}),
        atualizado: new Date().toISOString()
      },
      null,
      2
    )
  );
};
const vivoPid = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// "rodando" no arquivo só vale com o Claude vivo ou a janela dona viva; senão a execução foi interrompida e conta como parada.
// Pai com grupos de subtarefas (fase 'grupos'): rodando = algum grupo rodando; sem grupo rodando, aguardando ou pausado, conta como parado.
const situacao = (dir) => {
  const e = estado(dir);
  let rodando = maestro.rodando(dir) || filhos.has(dir) || (e.fase === 'rodando' && vivoPid(e.host));
  if (e.fase !== 'grupos') return { e, rodando, fase: e.fase === 'rodando' && !rodando ? 'parado' : e.fase };
  const gs = gruposDe(dir).map(situacao);
  rodando = rodando || gs.some((g) => g.rodando);
  return {
    e,
    rodando,
    fase: rodando || gs.some((g) => ['aguardando', 'pausado'].includes(g.fase)) ? 'grupos' : 'parado'
  };
};
// Pastas dos grupos de subtarefas (grupos/<id>/), em ordem.
const gruposDe = (dir) => {
  try {
    return fs
      .readdirSync(path.join(dir, 'grupos'))
      .sort()
      .map((g) => path.join(dir, 'grupos', g));
  } catch {
    return [];
  }
};
const controlesDe = (sit) => ({
  conversa: true,
  pausar: 'esteiraPausar',
  dicaPausar: 'Pausar a esteira: o Claude para e a etapa recomeça ao retomar',
  retomar:
    ['parado', 'erro'].includes(sit.fase) || (sit.fase === 'pausado' && sit.e.pausa?.motivo === 'manual')
      ? 'esteiraRetomar'
      : null,
  dicaRetomar: 'Retomar a esteira da etapa em que parou'
});
const existe = (dir, n) => fs.existsSync(path.join(dir, etapa(n).arq));
const pausar = (dir, etapa, pausa, aviso) => {
  mudar(dir, { etapa, fase: 'pausado', pausa: { opcoes: [], ...pausa } });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: aviso || `Esteira pausada na etapa ${etapa}: aguardando sua resposta` });
};

module.exports = {
  ESTADO,
  PAUSA,
  PAUSA_MD,
  RESPOSTAS,
  CONTEXTO,
  SEM_CONFIRMAR,
  TENTAR,
  SEGUIR,
  CORRIGIR,
  RESUMIR,
  REPETIR,
  VERIFICAR,
  lerJson,
  estado,
  mudar,
  situacao,
  gruposDe,
  controlesDe,
  existe,
  pausar
};
