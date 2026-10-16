// @ts-check
// Ambiente pelo preparar-ambiente.py da skill testes-funcionais (quando os Comandos não bastam).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { gravarJson, mudar } = require('../../../estado');
const { SKILL_AMB } = require('../../../orquestrador/prompt-comum');
const { AMBIENTE, ambiente, hoje, preparos, LOG_AMB } = require('../estado');
const { scriptPreparo, shaDe } = require('../dependencias');
const { ehLocal } = require('../../01-planejamento/dependencias');

function prepararPelaSkill(dir, chave, backend) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const script = backend && scriptPreparo(backend);
  if (!script) {
    vivo(
      'erro',
      backend
        ? 'Não achei o preparar-ambiente.py (nem no backend, nem na skill testes-funcionais)'
        : 'Sem repositório backend configurado (Configurações → repositórios)'
    );
    const erro = backend
      ? `preparar-ambiente.py não encontrado em ${path.join(backend, 'testes-funcionais')} nem em ${path.join(SKILL_AMB(), 'assets', 'backend')}`
      : 'nenhum repositório backend configurado (Configurações → repositórios) e nenhum novo-wms-backend ao lado do repositório de specs';
    fs.writeFileSync(path.join(dir, LOG_AMB), `${new Date().toISOString()}\n${erro}\n`);
    gravarJson(path.join(dir, AMBIENTE), {
      parou_em: 'config',
      erro,
      itens: [],
      em: new Date().toISOString(),
      data: hoje(),
      fonte: 'skill'
    });
    return Promise.resolve(null);
  }
  const antes = ambiente(dir),
    build = !antes || antes.fonte !== 'skill' || antes.data !== hoje() || !!antes.parou_em;
  vivo(
    'acao',
    `Preparando API, Metro, emulador e app${build ? ' (com build do app: 1º preparo do dia)' : ''}. O que já está de pé é reaproveitado`
  );
  return new Promise((ok) => {
    const args = [script, '--chave', chave, '--json', ...(build ? ['--build-app'] : [])];
    const log = fs.createWriteStream(path.join(dir, LOG_AMB), { flags: 'a' }); // depois do que a tentativa pelos Comandos escreveu
    log.write(`$ cd ${backend} && python3 ${args.join(' ')}\n${new Date().toISOString()}\n\n`);
    const p = spawn('python3', args, { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
    preparos.set(dir, p);
    mudar(dir, { pidPreparo: p.pid });
    let resto = '',
      json = null,
      erro = '';
    p.stdout.on('data', (b) => log.write(b));
    p.stderr.on('data', (b) => log.write(b));
    p.stdout.on('data', (b) => {
      const partes = (resto + b).split('\n');
      resto = partes.pop();
      for (const l of partes) {
        if (l.startsWith('{')) {
          try {
            json = JSON.parse(l);
          } catch {}
          continue;
        }
        const m = l.match(/^\s*\[(\s*OK\s*|FEITO|PEND\.|AVISO)\]\s*(.*)/);
        if (m) vivo(/PEND|AVISO/.test(m[1]) ? 'aviso' : 'acao', m[2].trim().slice(0, 200));
      }
    });
    p.stderr.on('data', (b) => {
      erro += b;
    });
    p.on('error', (e) => {
      erro = e.message;
    });
    p.on('close', (code, sinal) => {
      preparos.delete(dir);
      log.end(`\n[saiu com código ${code}${sinal ? `, sinal ${sinal}` : ''}]\n`);
      if (resto.startsWith('{')) {
        try {
          json = JSON.parse(resto);
        } catch {}
      }
      if (sinal) {
        vivo('aviso', 'Preparo do ambiente interrompido');
        return ok(null);
      }
      const amb = {
        ...(json || { parou_em: 'script', itens: [] }),
        erro: json ? null : erro.trim().slice(-300) || `saiu com código ${code}`,
        data: hoje(),
        em: new Date().toISOString(),
        build,
        fonte: 'skill',
        preparando: false,
        sha: { backend: shaDe(json?.backend), mobile: shaDe(json?.mobile) }
      };
      // Limite: ticket por documento (DOC-001) não tem branch nem refs; a skill procura por chave e para em 'refs'. Sem script que aceite isso, vale os Comandos.
      if (amb.parou_em && ehLocal(dir) && (amb.parou_em === 'refs' || /chave|branch|\bref/i.test(amb.erro || '')))
        amb.erro =
          'o ticket por documento não tem branch: use os Comandos do ambiente em Configurações ou ajuste a skill';
      gravarJson(path.join(dir, AMBIENTE), amb);
      if (amb.parou_em) {
        vivo(
          'erro',
          `Ambiente parou na etapa ${amb.parou_em}${amb.erro ? `: ${amb.erro}` : ''}. Log e análise no Ambiente do rodapé`
        );
        return ok(null);
      }
      vivo(
        'fim',
        `Ambiente pronto · ref ${amb.ref || '?'} · backend ${amb.sha.backend || '?'} · mobile ${amb.sha.mobile || '?'}${amb.pendentes ? ` · ${amb.pendentes} pendência(s)` : ''}`
      );
      ok(amb);
    });
  });
}

module.exports = { prepararPelaSkill };
