// @ts-check
// Veredito da reprodução de um bug/incidente (função pura, sem disco): decide pelos cenários do fluxo e pelo que aconteceu antes deles.
//   REPRODUZIDO      ≥1 cenário "falhou" (o erro aconteceu) COM evidência (print E vídeo)
//   SEM_EVIDENCIA    falhou, mas nenhum cenário que falhou tem print e vídeo (a evidência é obrigatória)
//   INCONCLUSIVO     sem passo a passo; ambiente/ref não subiu ou não bate com o commit; nenhum falhou e ≥1 bloqueado ou não executado;
//                    mídia essencial do ticket não analisada
//   NAO_REPRODUZIDO  todos passaram, nenhum bloqueado, ambiente na ref certa e toda mídia analisada
// Usado por: Implementações (1.6 Veredito). Teste: infra/reproducao/teste-reproducao.js.

const VEREDITOS = { REPRODUZIDO: 'REPRODUZIDO', SEM_EVIDENCIA: 'SEM_EVIDENCIA', INCONCLUSIVO: 'INCONCLUSIVO', NAO_REPRODUZIDO: 'NAO_REPRODUZIDO' };
const ROTULO = { REPRODUZIDO: 'Reproduzido', SEM_EVIDENCIA: 'Falhou sem evidência', INCONCLUSIVO: 'Inconclusivo', NAO_REPRODUZIDO: 'Não reproduzido' };

/**
 * @param {{ passos: { id: string, status: string, print?: boolean, video?: boolean }[], roteiro?: string, ambiente?: string, midia?: string[] }} c
 *   roteiro: motivo de não haver passo a passo (vazio = há); ambiente: motivo de o ambiente/ref não estar certo (vazio = certo);
 *   midia: vídeos/anexos essenciais não analisados
 * @returns {{ veredito: string, motivo: string, falhou: string[], semEvidencia: string[], bloqueados: string[] }}
 */
function veredito({ passos = [], roteiro = '', ambiente = '', midia = [] }) {
  const ids = (f) => passos.filter(f).map((p) => p.id);
  const falhou = ids((p) => p.status === 'falhou'),
    provados = ids((p) => p.status === 'falhou' && p.print && p.video),
    semEvidencia = falhou.filter((id) => !provados.includes(id)),
    bloqueados = ids((p) => p.status === 'bloqueado'),
    pendentes = ids((p) => p.status !== 'falhou' && p.status !== 'passou' && p.status !== 'bloqueado');
  const r = (v, motivo) => ({ veredito: v, motivo, falhou, semEvidencia, bloqueados });
  if (roteiro || !passos.length) return r(VEREDITOS.INCONCLUSIVO, roteiro || 'sem passo a passo: nenhum cenário planejado');
  if (ambiente) return r(VEREDITOS.INCONCLUSIVO, ambiente);
  if (provados.length) return r(VEREDITOS.REPRODUZIDO, `${provados.join(', ')} falhou com print e vídeo`);
  if (falhou.length) return r(VEREDITOS.SEM_EVIDENCIA, `${falhou.join(', ')} falhou sem print e vídeo`);
  const motivos = [
    bloqueados.length && `bloqueado: ${bloqueados.join(', ')}`,
    pendentes.length && `não executado: ${pendentes.join(', ')}`,
    midia.length && `mídia não analisada: ${midia.join(', ')}`
  ].filter(Boolean);
  if (motivos.length) return r(VEREDITOS.INCONCLUSIVO, motivos.join(' · '));
  return r(VEREDITOS.NAO_REPRODUZIDO, `os ${passos.length} cenário(s) passaram no ambiente na ref certa`);
}

module.exports = { veredito, VEREDITOS, ROTULO };
