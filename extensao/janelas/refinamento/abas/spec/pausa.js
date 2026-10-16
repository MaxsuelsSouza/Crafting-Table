// @ts-check
// Pausas da aba Spec gravadas pela extensão (.refinamento.json): briefing (ticket só com título), tipo do ticket e verificação.
const { esc } = require('../../../../infra/texto');
const { refinoDe } = require('../../locais');

// Ticket que só tem título não vai para a IA: o dev responde aqui e a resposta vira a fonte verbal do passo 1 (.briefing-refinamento.md).
const PERGUNTAS_BRIEFING = [
  'O que precisa mudar ou ser criado, e por quê (qual problema isso resolve)?',
  'Quem usa e como saber que ficou certo (resultado esperado)?',
  'O que fica de fora, restrições ou sistemas envolvidos que você já conhece?'
];
const caixaPausa = (t, dir) => {
  const pausa = refinoDe(dir).pausa;
  if (!pausa) return '';
  if (pausa.motivo === 'briefing')
    return `<div class="caixa-t">O ticket precisa de mais informação<span>o refinamento só começa depois da sua explicação</span></div>
    <div class="folha"><div class="atexto">${esc(pausa.pergunta)}</div><ol>${(pausa.perguntas || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
      <textarea data-texto style="width:100%;min-height:110px;box-sizing:border-box" placeholder="Responda com suas palavras: vira a fonte verbal do passo 1."></textarea>
      <div class="aacoes"><button class="primario" data-acao="refinoBriefing">Enviar e iniciar o refinamento</button></div></div>`;
  if (pausa.motivo === 'tipo')
    return `<div class="caixa-t">Qual o papel deste tipo de ticket?<span>o refinamento muda conforme o tipo; sua resposta fica nas variáveis</span></div>
    <div class="folha"><div class="atexto">${esc(pausa.pergunta)}</div>
      <div class="aacoes">
        <button class="primario" data-acao="refinoTipo" data-id="quebrar" title="Épico, Feature…: o refinamento propõe os itens do nível abaixo, sem spec técnica">Quebra em itens menores</button>
        <button class="primario" data-acao="refinoTipo" data-id="desenvolver" title="História, Tarefa, Bug…: spec completa e subtarefas de desenvolvimento">É o que o dev desenvolve</button>
        <button data-acao="refinoTipo" data-id="executar" title="Subtarefa: já é o trabalho, não se refina">Já é a unidade de trabalho</button>
      </div></div>`;
  return `<div class="agora"><div class="atitulo">${esc(pausa.pergunta)}</div><div class="atexto">${esc(pausa.detalhe || '')}</div>
    <div class="aacoes"><button class="primario" data-acao="retomar">▶ Continuar</button></div></div>`;
};

module.exports = { PERGUNTAS_BRIEFING, caixaPausa };
