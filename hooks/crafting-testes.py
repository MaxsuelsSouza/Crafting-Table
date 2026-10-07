#!/usr/bin/env python3
"""Ponte entre a skill testes-funcionais e a Crafting Table (VS Code), SEM modificar a skill.

PreToolUse  Bash `preparar-ambiente.py`  -> resolve os worktrees com a etapa `refs` da propria skill,
                                            pede a Crafting Table emulador + botoes API/Metro e espera
                                            ficar pronto; a skill depois reusa tudo (porta aberta / aparelho ligado).
PreToolUse  Bash jornada no app          -> pede para gravar a tela do emulador
PostToolUse Bash jornada no app          -> pede para parar a gravacao

Pedidos: ~/.claude/documentos/.pedidos/*.json (a extensao confirma renomeando para .ok).
Sem a extensao aberta, ou em qualquer erro, sai 0 e a skill segue sozinha como sempre.
"""
import importlib.util
import json
import os
import shlex
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

from documentos import pasta_da_conversa

RAIZ = Path.home() / ".claude" / "documentos"
PEDIDOS = RAIZ / ".pedidos"
VIVO = RAIZ / ".crafting-ativo"
SDK = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or Path.home() / "Android" / "Sdk")
ADB = str(SDK / "platform-tools" / "adb")
ESPERA = 600  # s: primeira subida da API (dotnet run) + boot do emulador
OPERADORES = {"&&", "||", ";", "|", ">", ">>", "2>&1", "&"}


def porta_aberta(porta):
    try:
        socket.create_connection(("localhost", porta), 1).close()
        return True
    except OSError:
        return False


def extensao_aberta():
    return VIVO.exists() and time.time() - VIVO.stat().st_mtime < 30


def pedir(dados):
    """Deixa o pedido e espera a extensao confirmar (ate 15 s)."""
    PEDIDOS.mkdir(parents=True, exist_ok=True)
    nome = PEDIDOS / f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
    tmp = nome.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False))
    tmp.rename(nome.with_suffix(".json"))
    for _ in range(30):
        ok = nome.with_suffix(".ok")
        if ok.exists():
            ok.unlink()
            return True
        time.sleep(0.5)
    nome.with_suffix(".json").unlink(missing_ok=True)
    return False


def comando_do_script(cmd, script, cwd):
    """(caminho absoluto do script, {flag: valor}) — respeita um `cd X &&` antes."""
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None, {}
    pasta = Path(cwd)
    for i, t in enumerate(tokens):
        if t == "cd" and i + 1 < len(tokens):
            pasta = (pasta / os.path.expanduser(tokens[i + 1])).resolve()
        if t.endswith(script):
            args, j = {}, i + 1
            while j < len(tokens) and tokens[j] not in OPERADORES:
                k = tokens[j]
                if k.startswith("--"):
                    if "=" in k:
                        k, v = k.split("=", 1)
                    elif j + 1 < len(tokens) and not tokens[j + 1].startswith("--") and tokens[j + 1] not in OPERADORES:
                        v, j = tokens[j + 1], j + 1
                    else:
                        v = True
                    args[k] = v
                j += 1
            return (pasta / os.path.expanduser(t)).resolve(), args
    return None, {}


def carregar_skill(script):
    spec = importlib.util.spec_from_file_location("preparar_ambiente", script)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(script.parent))
    spec.loader.exec_module(mod)
    import wms_env
    wms_env.carregar()
    return mod


def env_da_api(mod, backend, porta):
    """Mesmas variaveis que a etapa_api da skill passa ao dotnet run (preparar-ambiente.py:582-613).
    ponytail: espelha essa etapa; se a skill mudar os overrides da API, atualizar aqui."""
    idx, _, servico_no_arquivo = mod.indice_da_filial(backend / "FCxLabs.WMS.Api")
    if idx is None:
        return None
    env = {
        "ASPNETCORE_ENVIRONMENT": mod.ambiente_aspnet(),
        "ASPNETCORE_URLS": f"http://0.0.0.0:{porta}",
        "RabbitMQ__Host": os.environ.get("RabbitMQ__Host", "localhost"),
        "RabbitMQ__Port": os.environ.get("RabbitMQ__Port", "5672"),
        "RabbitMQ__Username": os.environ.get("RabbitMQ__Username", "guest"),
        "RabbitMQ__Password": os.environ.get("RabbitMQ__Password", "guest"),
    }
    desejado = (os.environ.get("WMS_DB_SERVICO") or "").lower()
    if not (servico_no_arquivo and desejado and servico_no_arquivo == desejado):
        cs = mod.connection_string()
        env[f"Filiais__{idx}__ConnectionString"] = cs
        env["ConnectionStrings__DefaultConnection"] = cs
    return env


def aparelho_pronto():
    try:
        r = subprocess.run([ADB, "shell", "getprop", "sys.boot_completed"], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() == "1"
    except Exception:
        return False


def preparar(dados, cmd):
    script, args = comando_do_script(cmd, "preparar-ambiente.py", dados.get("cwd", "."))
    if not script or not script.exists():
        return
    etapas = set(str(args.get("--etapas", "api,app")).split(","))
    if not etapas & {"api", "app"}:
        return

    # 1. Worktrees certos, pela propria skill (idempotente: o comando dela vai repetir isto).
    chamada = [sys.executable, str(script), "--etapas", "config,refs", "--json", "--sem-diario"]
    for flag in ("--chave", "--camadas", "--ref"):
        if isinstance(args.get(flag), str):
            chamada += [flag, args[flag]]
    r = subprocess.run(chamada, cwd=str(script.parent), capture_output=True, text=True, timeout=300)
    linha = next((l for l in reversed(r.stdout.splitlines()) if l.startswith("{")), None)
    if not linha:
        return
    res = json.loads(linha)
    if res.get("parou_em") or not res.get("backend"):
        return  # a skill mostra o pendente com o remedio
    chave = args.get("--chave") if isinstance(args.get("--chave"), str) else "sem-ticket"
    backend, mobile, camadas = Path(res["backend"]), res.get("mobile") or "", set(res.get("camadas") or [])

    sid = dados.get("session_id")
    pasta = Path(pasta_da_conversa(sid)) if sid else None
    if pasta:
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / ".ticket").write_text(json.dumps({"chave": chave, "backend": str(backend), "mobile": mobile}))
    if not extensao_aberta():
        return

    # 2. Botoes da aba Comandos para o que ainda nao responde.
    mod = carregar_skill(script)
    _, porta = mod.alvo_da_api(os.environ.get("WMS_API_URL", "http://localhost:5111"))
    botoes, esperar = [], []
    if "api" in camadas and not porta_aberta(porta):
        env = env_da_api(mod, backend, porta)
        if env and pasta:
            arq = pasta / f".api-{chave}.env"  # tem a connection string: so o dono le
            arq.write_text("".join(f"export {k}={shlex.quote(v)}\n" for k, v in env.items()))
            arq.chmod(0o600)
            botoes.append({"nome": f"API {chave}", "pasta": str(backend),
                           "comando": f". {shlex.quote(str(arq))} && dotnet run --project FCxLabs.WMS.Api --no-launch-profile"})
            esperar.append(lambda: porta_aberta(porta))
    if "app" in camadas and mobile and not porta_aberta(8081):
        # yarn start dispara yarn android neste repo; a skill usa react-native start em 0.0.0.0 (preparar-ambiente.py:673).
        botoes.append({"nome": f"Metro {chave}", "pasta": mobile,
                       "comando": "[ -d node_modules ] || yarn install; npx react-native start --host 0.0.0.0 --port 8081"})
        esperar.append(lambda: porta_aberta(8081))
    emulador = "app" in camadas
    if emulador:
        esperar.append(aparelho_pronto)
    if not (botoes or emulador) or not pedir({"tipo": "ambiente", "sid": sid, "chave": chave,
                                              "emulador": emulador, "botoes": botoes}):
        return

    # 3. Espera tudo responder; depois o comando da skill reusa o que esta de pe.
    limite = time.time() + ESPERA
    while time.time() < limite and not all(f() for f in esperar):
        time.sleep(3)
    pronto = all(f() for f in esperar)
    print(json.dumps({"systemMessage": "Crafting Table: " + (
        f"ambiente do {chave} pronto (emulador, API e Metro na aba Comandos)." if pronto
        else f"ambiente do {chave} nao ficou pronto em {ESPERA // 60} min; a skill segue e mostra o que falta.")}))


def eh_jornada(cmd):
    return ("executar-jornada.py" in cmd or ("executar.py" in cmd and "--com-app" in cmd)) and "--gravar" not in cmd


def main():
    dados = json.load(sys.stdin)
    entrada = dados.get("tool_input") or {}
    cmd = entrada.get("command") or ""
    evento = dados.get("hook_event_name")
    if "preparar-ambiente.py" in cmd and evento == "PreToolUse":
        preparar(dados, cmd)
    # Em segundo plano o PostToolUse chega na hora: nao da para saber quando a jornada acaba.
    elif eh_jornada(cmd) and not entrada.get("run_in_background") and extensao_aberta():
        _, args = comando_do_script(cmd, "executar.py" if "executar.py" in cmd else "executar-jornada.py", dados.get("cwd", "."))
        chave = args.get("--chave") if isinstance(args.get("--chave"), str) else "sem-ticket"
        pedir({"tipo": "gravar", "acao": "iniciar" if evento == "PreToolUse" else "parar",
               "sid": dados.get("session_id"), "chave": chave})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # nunca atrapalhar a skill
