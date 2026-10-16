// @ts-check
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const maestro = require('../../../infra/agentes/maestro');
const { areaIA } = require('../../../infra/agentes/area-ia');
const aoVivo = require('../../../componentes/ao-vivo');
const entrada = require('../../entrada');
const { cfg } = require('../../../configuracao/configuracao');
const jira = require('../../../infra/provedores/fachada').jira;
const { docLocal, provNome } = require('./dependencias');

// Roda a IA em segundo plano sobre o plano local: grava o contexto do ticket (via provedor), roda o Claude (só leitura local + o qa-plano.md)
// e, ao terminar, a extensão publica e procura o plano de novo. Devolve se a IA começou.
// A IA escreve o plano na área dela (infra/agentes/area-ia.js: o Claude Code nega escrita em ~/.claude) e a extensão o copia para dir.
// prompt(rasc): monta o prompt com a pasta onde a IA grava.
async function gerarPlano(s, t, dir, { prompt, titulo, mudanca = false }) {
  const rasc = areaIA(dir),
    noRasc = path.join(rasc, qa.PLANO_LOCAL),
    noDir = path.join(dir, qa.PLANO_LOCAL);
  const ler = (f) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return null;
    }
  };
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  try {
    const j =
      s.cacheJira[t.id] && !s.cacheJira[t.id].erro
        ? s.cacheJira[t.id]
        : await jira.buscar(s.secrets, { key: t.chave, site: t.site });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, qa.CONTEXTO), qa.contextoTicket(j, t));
    // Dossiê do ticket: sem nenhuma fonte (só o título), pergunta ao dev em vez de deixar a IA inventar.
    const ent = entrada.preparar(t, dir, j);
    if (ent.pergunta && !mudanca) {
      qa.mudar(dir, {
        fase: 'sem_plano',
        pausa: { motivo: 'briefing', pergunta: ent.pergunta, opcoes: [], etapa: 'Planejamento' }
      });
      vivo('aviso', 'Ticket só com título: preciso que você explique o que testar antes de planejar');
      return false;
    }
    fs.mkdirSync(rasc, { recursive: true });
    fs.rmSync(path.join(rasc, qa.PAUSA), { force: true });
    if (mudanca && fs.existsSync(noDir)) fs.copyFileSync(noDir, noRasc);
    else fs.rmSync(noRasc, { force: true });
  } catch (e) {
    vivo('erro', `Não consegui ler o ticket no ${provNome(t)}: ${e.message}`);
    qa.mudar(dir, { fase: 'erro', erro: e.message });
    return false;
  }
  const antes = ler(noRasc);
  let tratou = false;
  return maestro.rodar(dir, {
    prompt: prompt(rasc),
    titulo,
    ferramentas: qa.FERRAMENTAS_PLANO,
    extras: [
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      dir,
      rasc,
      ...(docLocal(t) ? [path.dirname(dir)] : []),
      ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])
    ],
    aoMudar: () => {
      s.render();
      if (maestro.rodando(dir) || tratou) return;
      tratou = true; // publica uma vez só (aoMudar dispara mais de uma vez ao terminar)
      try {
        // Pergunta da IA (.pausa.json na área dela): vira pausa no cartão e a resposta refaz o plano.
        const pergunta = ler(path.join(rasc, qa.PAUSA));
        if (pergunta) {
          const p = JSON.parse(pergunta);
          if (p?.pergunta) {
            qa.mudar(dir, {
              fase: mudanca ? 'plano_encontrado' : 'sem_plano',
              pausa: {
                motivo: String(p.motivo || ''),
                pergunta: String(p.pergunta),
                opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [],
                etapa: 'Planejamento'
              }
            });
            vivo('aviso', `O Claude perguntou: ${p.pergunta}`);
            return s.render();
          }
        }
        const depois = ler(noRasc);
        if (depois === null) throw new Error(`O Claude não gravou ${qa.PLANO_LOCAL}`);
        if (mudanca && depois === antes) throw new Error('O Claude não alterou o plano');
        fs.writeFileSync(noDir, depois);
        qa.conferirPlano(depois).forEach((a) => vivo('aviso', a));
        qa.proporPlano(dir, t.chave); // fica local: o provedor só recebe quando você aprovar
      } catch (e) {
        vivo('erro', `Plano não gravado: ${e.message}`);
        qa.mudar(dir, { fase: 'erro', erro: e.message });
      }
      s.render();
    }
  });
}

module.exports = { gerarPlano };
