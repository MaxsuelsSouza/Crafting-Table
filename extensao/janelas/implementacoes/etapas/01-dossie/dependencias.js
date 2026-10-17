// @ts-check
// Dependências da Reprodução com o mundo de fora (VS Code, ambiente, ffmpeg, ferramenta de tickets). Os testes trocam os campos de `deps`.
//   ambiente(s, t)            nome do ambiente do ticket (infra/ambientes/escolher.js)
//   subir(dir, nome, vivo)    sobe o ambiente (Pronto com sha | Parou), com os Comandos e a configuração da extensão
//   obter(nome)               o ambiente (texto, guia, comoPrint, ferramentas, mcp, evidencia)
//   quadros(pasta, videos)    quadros dos vídeos (infra/reproducao/quadros-video.js)
//   comentar(s, t, md)        publica o comentário no ticket (provedor.comentar): SÓ depois da aprovação do dev
//   comentarios(s, t)         comentários do ticket, mais antigos primeiro ({ id, data, autor, texto })
//   esperarVideo(pasta)       espera o vídeo da sessão terminar de chegar (Android: o screenrecord é puxado do aparelho depois do parar)
const fs = require('fs');
const ambientes = require('../../../../infra/ambientes');
const reproducao = require('../../../../infra/reproducao');

const cfg = () => require('../../../../configuracao/configuracao').cfg();
const cmds = () => require('../../../../modulos/comandos').api;

const deps = {
  ambiente: (s, t) => ambientes.escolher({ repos: s.reposDe?.(t) || [], padrao: cfg().get('ambientePadrao') }),
  subir: (dir, nome, vivo) =>
    ambientes.obter(nome).subir(
      dir,
      {
        comandos: {
          lista: () => cmds()?.lista() || [],
          rodar: (n) => {
            const b = cmds()
              ?.lista()
              .find((x) => x.nome === n);
            if (b && !b.rodando) cmds().alternar({ id: b.id });
          }
        },
        esperar: (teste, segundos) => require('../../../../infra/ambientes/aplicacao/portas').esperar(teste, segundos),
        avd: cfg().get('avdPadrao'),
        serial: cfg().get('aparelhoSerial') || '',
        webUrl: cfg().get('webUrl') || '',
        adb: require('../../../../infra/ambientes/android/adb').ADB
      },
      vivo
    ),
  obter: (nome) => ambientes.obter(nome),
  quadros: (pasta, videos) => reproducao.extrairQuadros(pasta, videos),
  comentar: (s, t, md) => {
    const { jira } = require('../../../../infra/provedores/fachada');
    return jira.comentar(s.secrets, jira.alvo(t), md);
  },
  comentarios: (s, t) => {
    const { jira } = require('../../../../infra/provedores/fachada');
    return jira.comentarios(s.secrets, jira.alvo(t));
  },
  // ponytail: espera fixa de até 15 s pelo arquivo; aumentar se o pull do screenrecord demorar mais
  esperarVideo: async (pasta) => {
    for (let i = 0; i < 30; i++) {
      try {
        if (fs.readdirSync(pasta).some((n) => reproducao.VIDEO.test(n))) return;
      } catch {
        /* pasta ainda não existe */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};

module.exports = { deps };
