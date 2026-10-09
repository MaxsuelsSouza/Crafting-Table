#!/usr/bin/env bash
# Instala a Crafting Table a partir deste repositório. Pode rodar de novo: cada passo é idempotente.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"

for c in node npm python3 claude code; do
  command -v "$c" >/dev/null || { echo "Falta o comando '$c' no PATH (veja Requisitos no README)."; exit 1; }
done

echo "1/5 Dependências da extensão"
(cd "$REPO/extensao" && npm ci --omit=dev --no-audit --no-fund --silent)

echo "2/5 Extensão no VS Code (~/.vscode/extensions/crafting-table → $REPO/extensao)"
EXT="$HOME/.vscode/extensions/crafting-table"
# Cópias antigas saem de ~/.vscode/extensions: lá dentro o VS Code pode registrar a cópia no lugar do link.
BAK="$HOME/.vscode/extensions-bak"
for velho in "$EXT" "$HOME/.vscode/extensions/claude-abas"; do
  if [ -L "$velho" ]; then rm "$velho"
  elif [ -e "$velho" ]; then mkdir -p "$BAK"; mv "$velho" "$BAK/$(basename "$velho").bak-$(date +%Y%m%d%H%M%S)"; echo "   $velho guardada em $BAK"; fi
done
mkdir -p "$(dirname "$EXT")"
ln -sfn "$REPO/extensao" "$EXT"
# Aponta o registro do VS Code para o link (se ele ficou com uma pasta antiga).
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.vscode/extensions/extensions.json")
try: d = json.load(open(p))
except Exception: raise SystemExit
for e in d:
    if e.get("identifier", {}).get("id") == "local.claude-abas":
        e["location"]["path"] = os.path.expanduser("~/.vscode/extensions/crafting-table"); e["relativeLocation"] = "crafting-table"
json.dump(d, open(p, "w"))
PY

echo "3/5 Plugin SDD do Claude Code"
claude plugin marketplace add "$REPO/plugin" >/dev/null 2>&1 || claude plugin marketplace update crafting-local >/dev/null
claude plugin install sdd@crafting-local >/dev/null 2>&1 || claude plugin update sdd@crafting-local >/dev/null

echo "4/5 Hooks do Claude Code (~/.claude/hooks + ~/.claude/settings.json)"
mkdir -p "$HOME/.claude/hooks"
for h in documentos decisoes crafting-testes notificacoes; do ln -sfn "$REPO/hooks/$h.py" "$HOME/.claude/hooks/$h.py"; done
python3 - <<'EOF'
import json, shutil, time
from pathlib import Path
arq = Path.home() / ".claude" / "settings.json"
cfg = json.loads(arq.read_text()) if arq.exists() else {}
if arq.exists():
    shutil.copy(arq, arq.with_name(f"settings.json.bak-crafting-{int(time.time())}"))
cmd = lambda h: f"python3 ~/.claude/hooks/{h}.py 2>/dev/null || true"
QUERO = [  # evento, matcher, hook
    ("SessionStart", None, {"type": "command", "command": cmd("documentos"), "timeout": 10}),
    ("UserPromptSubmit", None, {"type": "command", "command": cmd("documentos"), "timeout": 10}),
    ("UserPromptSubmit", None, {"type": "command", "command": cmd("decisoes"), "timeout": 120, "async": True}),
    ("PostToolUse", "Write", {"type": "command", "command": cmd("documentos"), "timeout": 10}),
    ("PostToolUse", "Bash", {"type": "command", "command": cmd("crafting-testes"), "timeout": 30}),
    ("PostToolUse", "AskUserQuestion", {"type": "command", "command": cmd("decisoes"), "timeout": 15}),
    ("Stop", None, {"type": "command", "command": cmd("notificacoes"), "timeout": 10}),
    ("Notification", None, {"type": "command", "command": cmd("notificacoes"), "timeout": 10}),
    ("PreToolUse", "Bash", {"type": "command", "command": cmd("crafting-testes"), "timeout": 1000,
                            "statusMessage": "Crafting Table: conferindo o ambiente de testes"}),
]
hooks = cfg.setdefault("hooks", {})
novos = 0
for evento, matcher, h in QUERO:
    grupos = hooks.setdefault(evento, [])
    ja = any(x.get("command") == h["command"] and g.get("matcher") == matcher for g in grupos for x in g.get("hooks", []))
    if not ja:
        grupos.append({**({"matcher": matcher} if matcher else {}), "hooks": [h]})
        novos += 1
arq.parent.mkdir(parents=True, exist_ok=True)
arq.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
print(f"   {novos} hook(s) adicionado(s), {len(QUERO) - novos} já estava(m) lá")
EOF

echo "5/5 Extensão do GNOME (opcional: traz a janela do emulador para frente)"
if command -v gnome-extensions >/dev/null; then
  G="$HOME/.local/share/gnome-shell/extensions/claude-abas-janelas@local"
  mkdir -p "$(dirname "$G")"; ln -sfn "$REPO/gnome/claude-abas-janelas@local" "$G"
  gnome-extensions enable claude-abas-janelas@local 2>/dev/null || echo "   saia e entre de novo na sessão do GNOME e rode: gnome-extensions enable claude-abas-janelas@local"
else
  echo "   GNOME não encontrado: pulado"
fi

echo
echo "Pronto. Feche TODAS as janelas do VS Code e abra de novo (Reload Window não basta na primeira vez)."
