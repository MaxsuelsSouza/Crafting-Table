// @ts-check
// Respostas às pausas da Reprodução (orquestrador/responder.js repassa os MOTIVOS para cá):
//   repro-nao (NÃO REPRODUZIDO) · repro-inconclusivo (INCONCLUSIVO) · repro-evidencia (falhou sem print e vídeo) · aguardando-dados (pedido no Jira)
//   Tentar de novo       refaz o roteiro (1.3) e a reprodução; o fluxo anterior fica guardado
//   Pedir mais dados     rascunho do comentário (regras/pedir-dados.js); só publica com aprovação
//   Seguir sem confirmar segue para a etapa 2, registrado no reproducao.md
//   Encerrar             fecha a esteira sem desenvolver (o erro não existe ou não é para corrigir)
//   texto livre          vira resposta do dev (.respostas.md, a 1.3 lê) e tenta de novo; no pedido ainda não publicado, troca o rascunho
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { gravarResumo, reiniciar } = require('../reproducao/resultado');
const { RESPOSTAS, SEM_CONFIRMAR, TENTAR, estado, mudar } = require('../../../estado');
const { PEDIR, MOTIVO, rascunhar, responderPedido } = require('./pedir-dados');

const ENCERRAR = 'Encerrar a esteira (não corrigir)';
const MOTIVOS = ['repro-nao', 'repro-evidencia', 'repro-inconclusivo', MOTIVO];

async function responderRepro(s, t, r) {
  const dir = s.pastaAba(t.id),
    e = estado(dir),
    seguir = () => require('../../../orquestrador/seguir').seguir(s, t); // ciclo: seguir → 01-dossie
  if (e.pausa.motivo === MOTIVO && ![TENTAR, SEM_CONFIRMAR].includes(r) && (await responderPedido(s, t, r)))
    return s.render();
  if (r === PEDIR) return rascunhar(s, t, e.pausa.pergunta);
  if (r === SEM_CONFIRMAR) {
    gravarResumo(dir, t.chave, 'seguiu sem confirmar por decisão do usuário', e.repro);
    mudar(dir, { pausa: null, reproducao: 'aceita', etapa: 2, fase: 'parado' });
    return seguir();
  }
  if (r === ENCERRAR) {
    gravarResumo(dir, t.chave, 'esteira encerrada pelo usuário sem corrigir', e.repro);
    mudar(dir, { pausa: null, reproducao: 'encerrada', fase: 'concluido' });
    aoVivo.anotar(dir, { tipo: 'fim', texto: 'Esteira encerrada na reprodução: nada a corrigir' });
    return s.render();
  }
  if (r !== TENTAR) fs.appendFileSync(path.join(dir, RESPOSTAS), `## Reprodução · ${e.pausa.pergunta}\n${r}\n\n`);
  reiniciar(dir);
  mudar(dir, { pausa: null, etapa: 1, fase: 'parado', reproducao: undefined });
  return seguir();
}

module.exports = { MOTIVOS, ENCERRAR, PEDIR, responderRepro };
