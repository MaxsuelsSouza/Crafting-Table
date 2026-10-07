#!/usr/bin/env python3
"""Histórico de decisões por conversa (aba Decisões dos Refinamentos, Crafting Table).

PostToolUse  AskUserQuestion -> grava cada pergunta respondida: pergunta, opções, escolha e observações (exato).
UserPromptSubmit (async)     -> o Haiku lê a mensagem do usuário + o fim da última resposta do Claude
                                e diz se é uma decisão (escolha, mudança de rumo, regra); se for, grava.

Destino: ~/.claude/documentos/<session_id>/.decisoes.json  (lista; a mais nova no fim)
Nunca bloqueia nem atrasa o chat: qualquer erro sai em silêncio.
"""
import fcntl
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path.home() / ".claude" / "documentos"
FILHO = "CRAFTING_DECISOES_FILHO"  # marca a chamada ao Haiku: ela não pode disparar este hook de novo


def agora():
    return datetime.now(timezone.utc).isoformat()


def gravar(sid, decisao):
    pasta = RAIZ / sid
    pasta.mkdir(parents=True, exist_ok=True)
    arq = pasta / ".decisoes.json"
    with open(pasta / ".decisoes.lock", "w") as trava:  # duas mensagens seguidas não se atropelam
        fcntl.flock(trava, fcntl.LOCK_EX)
        try:
            lista = json.loads(arq.read_text())
        except (OSError, ValueError):
            lista = []
        lista.append({"id": uuid.uuid4().hex[:12], "data": agora(), **decisao})
        tmp = arq.with_suffix(".tmp")
        tmp.write_text(json.dumps(lista, ensure_ascii=False, indent=1))
        tmp.replace(arq)


# ── 1. Perguntas do Claude (AskUserQuestion) ──
def pergunta(dados):
    resp = dados.get("tool_response") or {}
    if isinstance(resp, str):  # formato antigo: texto "…"="…"
        resp = {"answers": dict(re.findall(r'"([^"]+)"="([^"]*)"', resp))}
    respostas = resp.get("answers") or (dados.get("tool_input") or {}).get("answers") or {}
    anotacoes = resp.get("annotations") or {}
    perguntas = resp.get("questions") or (dados.get("tool_input") or {}).get("questions") or []
    for q in perguntas:
        texto = q.get("question", "")
        escolha = respostas.get(texto)
        if not escolha:
            continue
        opcoes = [o.get("label", "") for o in q.get("options", [])]
        nota = (anotacoes.get(texto) or {}).get("notes", "")
        titulo = f"{q.get('header') or texto[:40]}: {escolha}"
        resumo = f"O Claude perguntou: {texto} Opções: {', '.join(opcoes)}. Escolhido: {escolha}." + (f" Observação: {nota}" if nota else "")
        gravar(dados["session_id"], {"origem": "pergunta", "titulo": titulo[:90], "resumo": resumo,
                                     "detalhes": {"pergunta": texto, "opcoes": opcoes, "escolha": escolha, "notas": nota}})


# ── 2. Mensagens do usuário (Haiku decide) ──
def ultima_resposta(transcript):
    try:
        linhas = Path(transcript).read_text(errors="replace").splitlines()
    except OSError:
        return ""
    for l in reversed(linhas):
        try:
            d = json.loads(l)
        except ValueError:
            continue
        if d.get("type") != "assistant":
            continue
        partes = (d.get("message") or {}).get("content") or []
        texto = " ".join(p.get("text", "") for p in partes if isinstance(p, dict) and p.get("type") == "text").strip()
        if texto:
            return texto[-2500:]
    return ""


PEDIDO = """Você classifica mensagens de um desenvolvedor para um histórico de DECISÕES de um refinamento de software.
É decisão quando a mensagem: escolhe entre opções que o assistente apresentou; manda fazer diferente do que o assistente
propôs ou fez; define uma regra, abordagem, escopo, prioridade ou restrição a seguir. NÃO é decisão: pedido comum de
tarefa sem escolha ("rode os testes", "crie o arquivo"), pergunta, agradecimento, "ok/sim" sem conteúdo novo.

Última resposta do assistente (pode estar vazia):
<<<{contexto}>>>

Mensagem do desenvolvedor:
<<<{mensagem}>>>

Responda SOMENTE com JSON, sem texto fora dele:
{{"decisao": true|false, "titulo": "até 60 caracteres, em português, nome curto da decisão", "resumo": "2 a 4 frases: o que estava em jogo, o que foi decidido e por quê (se disse)"}}"""


def mensagem(dados):
    texto = (dados.get("prompt") or "").strip()
    if len(texto) < 3 or texto.startswith("/"):
        return
    contexto = ultima_resposta(dados.get("transcript_path", ""))
    env = {**os.environ, FILHO: "1"}
    r = subprocess.run(
        ["claude", "-p", "--model", "haiku", "--no-session-persistence", "--settings", '{"disableAllHooks": true}'],
        input=PEDIDO.format(contexto=contexto, mensagem=texto[:3000]), capture_output=True, text=True,
        timeout=90, cwd="/tmp", env=env)
    achado = re.search(r"\{.*\}", r.stdout, re.S)
    if not achado:
        return
    j = json.loads(achado.group(0))
    if j.get("decisao") is True and j.get("titulo"):
        gravar(dados["session_id"], {"origem": "chat", "titulo": j["titulo"][:90], "resumo": j.get("resumo", ""),
                                     "detalhes": {"mensagem": texto[:1500], "contexto": contexto[-600:]}})


def main():
    if os.environ.get(FILHO):
        return
    dados = json.load(sys.stdin)
    if not dados.get("session_id"):
        return
    evento = dados.get("hook_event_name")
    if evento == "PostToolUse" and dados.get("tool_name") == "AskUserQuestion":
        pergunta(dados)
    elif evento == "UserPromptSubmit":
        mensagem(dados)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
