// @ts-check
// Dependências das ações: VS Code, configurações, provedor (Jira ou documento), emulador, Comandos e gravação de tela.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const banco = require('../../../../infra/agentes/banco');
const { cfg } = require('../../../../configuracao/configuracao');
const { NOTIF } = require('../../../../painel/notificacoes');
const jira = require('../../../../infra/provedores/fachada').jira;
const { executar: executarSql } = require('../../etapas/05-massa/dependencias');
const docLocal = (t) => jira.ehDocumento(t); // ticket por documento: tudo pelo adaptador local, sem rede e sem conta
const provNome = (t) => (docLocal(t) ? 'documento' : jira.nome);
const EVID = 'claudeAbas.evidencias'; // mesma id da seção Evidências (moldura.js)

// Subtarefas do ticket (com a descrição em Markdown) pelo provedor: é onde o QA procura o planejamento.
const filhosDe = (s, t) => (chave) =>
  jira.filhos(s.secrets, { key: chave === t.chave ? jira.alvo(t).key : chave, site: t.site });

// Publicação do plano local no provedor (qa.publicarPlano): subtarefa [QA] nova ou atualizada; sem subtarefas, comentário no ticket.
const depsPublicar = (s, t) => {
  const alvo = { key: t.chave, site: t.site };
  return {
    chave: t.chave,
    filhos: filhosDe(s, t),
    subtarefas: docLocal(t) || jira.capacidades.subtarefas !== false,
    criarSubtarefa: (o) => jira.criarSubtarefa(s.secrets, alvo, o),
    atualizarDescricao: (key, md) => jira.atualizarDescricao(s.secrets, alvo, key, md),
    comentar: (md) => jira.comentar(s.secrets, alvo, md)
  };
};

const depsQa = (s, t) => {
  const dir = s.pastaAba(t.id),
    emu = require('../../../../modulos/emulador');
  return {
    chave: t.chave,
    backend: s.reposDe(t).find((r) => r.camada === 'backend')?.caminho,
    filhos: filhosDe(s, t),
    horaRefresh: cfg().get('qaHoraRefresh') || '06:00',
    aoMudar: s.render,
    timeoutMin: Number(cfg().get('qaTimeoutCenarioMin') ?? 30),
    loteRoteiro: Number(cfg().get('qaLoteRoteiro') ?? 6),
    banco: banco.daConfig(cfg()),
    executarSql: (b, stmts) => executarSql(b, stmts),
    // Modelo e esforço do QA em segundo plano (os plugins, MCP e skills saem em orquestrador/claude.js).
    modelo: cfg().get('qaModelo') ?? 'sonnet',
    esforco: cfg().get('qaEsforco') ?? 'medium',
    extras: ['--add-dir', dir],
    // Ambiente: primeiro os Comandos das Configurações (API, Metro) e o emulador padrão; o script da skill completa o que faltar.
    comandos: {
      lista: () => require('../../../../modulos/comandos').api?.lista() || [],
      rodar: (nome) => {
        const api = require('../../../../modulos/comandos').api,
          b = api?.lista().find((x) => x.nome === nome);
        if (b && !b.rodando) api?.alternar({ id: b.id });
      }
    },
    emulador: {
      avd: cfg().get('avdPadrao'),
      aparelhos: () => emu.dispositivos(),
      ligar: () => emu.ligar(cfg().get('avdPadrao'))
    },
    adb: path.join(emu.SDK, 'platform-tools', 'adb'),
    confirmar: async (texto) => (await vscode.window.showWarningMessage(texto, { modal: true }, 'Usar')) === 'Usar',
    alertar: (texto) => {
      vscode.window.showErrorMessage(texto, { modal: true });
    },
    gravarTela: (destino) => {
      if (emu.emuladorRodando())
        require('../../../../modulos/evidencias').gravar?.({ destino, chave: t.chave, continuo: true });
    },
    pararTela: () => require('../../../../modulos/evidencias').pararGravacao?.(),
    avisar: (texto) => {
      try {
        fs.appendFileSync(
          path.join(dir, NOTIF),
          JSON.stringify({ em: new Date().toISOString(), tipo: 'fim', texto: `${t.chave} · ${texto}` }) + '\n'
        );
      } catch {}
    }
  };
};

module.exports = { docLocal, provNome, EVID, filhosDe, depsPublicar, depsQa };
