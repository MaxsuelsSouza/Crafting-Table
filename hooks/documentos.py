#!/usr/bin/env python3
"""Documentos por conversa do Claude Code (usado pela aba Documentos da extensão Crafting Table).

~/.claude/documentos/<session_id>/   documentos da conversa
~/.claude/documentos/.atual/<hash>   id da conversa ativa no workspace (hash = sha1(cwd)[:16])

SessionStart     cria a pasta, marca a conversa e avisa o Claude onde salvar documentos
UserPromptSubmit marca a conversa (troca de conversa na barra lateral)
PostToolUse      Write de documento fora da pasta ganha um atalho (symlink) nela
"""
import hashlib
import json
import os
import sys

RAIZ = os.path.expanduser("~/.claude/documentos")
TICKETS = os.path.expanduser("~/.claude/tickets")
CLAUDE = os.path.expanduser("~/.claude") + os.sep
EXTENSOES = {".md", ".html", ".htm", ".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt"}


def ticket_da(sid):
    """Chave do ticket a que a conversa foi vinculada pela extensao (tickets/.conversas/<sid>), ou None."""
    try:
        return open(os.path.join(TICKETS, ".conversas", sid)).read().strip() or None
    except OSError:
        return None


def pasta_da_conversa(sid):
    """Pasta da conversa: a do ticket vinculado, senao documentos/<sid>. Mesmo criterio de sessao.js."""
    t = ticket_da(sid)
    return os.path.join(TICKETS, t) if t else os.path.join(RAIZ, sid)


def marcar(dados):
    sid, cwd = dados.get("session_id"), dados.get("cwd")
    if not sid or not cwd:
        return None
    pasta = pasta_da_conversa(sid)
    os.makedirs(pasta, exist_ok=True)
    os.makedirs(os.path.join(RAIZ, ".atual"), exist_ok=True)
    with open(os.path.join(RAIZ, ".atual", hashlib.sha1(cwd.encode()).hexdigest()[:16]), "w") as f:
        f.write(sid)
    return pasta


def atalho(dados, pasta):
    arquivo = (dados.get("tool_input") or {}).get("file_path") or ""
    arquivo = os.path.realpath(arquivo) if arquivo else ""
    if not arquivo or os.path.splitext(arquivo)[1].lower() not in EXTENSOES:
        return
    if arquivo.startswith(CLAUDE):  # memória, planos, ~/.claude/documentos e ~/.claude/tickets
        return
    base, ext = os.path.splitext(os.path.basename(arquivo))
    destino, n = os.path.join(pasta, base + ext), 1
    while os.path.lexists(destino):
        if os.path.islink(destino) and os.path.realpath(destino) == arquivo:
            return
        n += 1
        destino = os.path.join(pasta, f"{base}-{n}{ext}")
    os.symlink(arquivo, destino)


def cofre():
    """Nomes (nunca valores) dos segredos do Cofre da Crafting Table liberados para o Claude."""
    try:
        nomes = open(os.path.join(RAIZ, ".cofre-nomes")).read().split()
    except OSError:
        return ""
    if not nomes:
        return ""
    return ("Cofre da Crafting Table: segredos disponiveis como variaveis de ambiente: " + ", ".join(nomes) + ". "
            "Para usar, rode o comando atraves de ~/.vscode/extensions/crafting-table/bin/cofre '<comando que usa $NOME>' "
            "(cofre --nomes lista os atuais). A saida volta com os valores mascarados. Nunca tente ler, imprimir ou "
            "transformar o valor de um segredo, nem procure onde ele esta guardado.\n")


def main():
    dados = json.load(sys.stdin)
    evento = dados.get("hook_event_name")
    pasta = marcar(dados)
    if not pasta:
        return
    if evento == "SessionStart":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": cofre() +
            (f"Esta conversa pertence ao ticket {ticket_da(dados['session_id'])}. Pasta de documentos do ticket: {pasta}\n"
             if ticket_da(dados["session_id"]) else f"Pasta de documentos desta conversa: {pasta}\n") +
            "Salve ali todo documento que você criar para o usuário e que não faça parte do código do repositório "
            "(relatórios, análises, planos, resumos, roteiros de teste, .md/.html/.pdf/.docx/.xlsx/.csv). "
            "O usuário vê essa pasta na aba Documentos do VS Code. "
            f"Evidências de teste desta conversa (prints, vídeos, GIFs do emulador) vão em {pasta}/evidencias."}}))
    elif evento == "PostToolUse":
        atalho(dados, pasta)


if __name__ == "__main__":
    main()
