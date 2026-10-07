#!/usr/bin/env python3
"""Notificações do ticket (🔔 no rodapé do ticket na Crafting Table).

Stop          -> "O Claude terminou"
Notification  -> o aviso do Claude Code (ex.: precisa de permissão); o de inatividade é repetido do Stop e fica de fora

Destino: <pasta da conversa>/.notificacoes.jsonl, uma linha {em, tipo, texto}. O sdd-state grava ali também.
Nunca bloqueia: qualquer erro sai em silêncio.
"""
import json
import os
import sys
from datetime import datetime, timezone

from documentos import pasta_da_conversa


def main():
    dados = json.load(sys.stdin)
    sid, evento = dados.get("session_id"), dados.get("hook_event_name")
    if not sid:
        return
    if evento == "Stop":
        if dados.get("stop_hook_active"):
            return
        fim = " ".join((dados.get("last_assistant_message") or "").split())
        nota = {"tipo": "fim", "texto": "O Claude terminou" + (f": {fim[:140]}{'…' if len(fim) > 140 else ''}" if fim else "")}
    elif evento == "Notification":
        if dados.get("notification_type") == "idle_prompt":
            return
        nota = {"tipo": "permissao" if "permission" in (dados.get("message") or "") else "aviso", "texto": dados.get("message") or "Aviso do Claude"}
    else:
        return
    pasta = pasta_da_conversa(sid)
    if not os.path.isdir(pasta):
        return
    with open(os.path.join(pasta, ".notificacoes.jsonl"), "a") as f:
        f.write(json.dumps({"em": datetime.now(timezone.utc).isoformat(), **nota}, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
