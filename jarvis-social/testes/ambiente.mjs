// Monta API + worker sobre o banco em memória, com relógio controlado.
import { BancoMemoria } from "../supabase/functions/_compartilhado/banco.js";
import { ArmazenamentoMemoria } from "../supabase/functions/_compartilhado/armazenamento.js";
import { criarApi } from "../supabase/functions/_compartilhado/api.js";
import { criarWorker } from "../supabase/functions/_compartilhado/worker.js";
import { criarInstagramSimulado } from "../supabase/functions/_compartilhado/instagram.js";
import { cifrar } from "../supabase/functions/_compartilhado/cifra.js";

export function ambiente({ agora = "2026-11-22T15:00:00.000Z", falhas = {}, estado = null } = {}) {
  const rel = { t: agora };
  const relogio = () => rel.t;
  const banco = new BancoMemoria(estado);
  const arm = new ArmazenamentoMemoria();
  const ig = criarInstagramSimulado({ falhas, agora: relogio });
  const segredos = { urlPainel: "https://painel.exemplo/", appId: "1", appSecret: "s", redirectUri: "https://x/retorno", chaveCifra: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) };
  const api = criarApi({ banco, armazenamento: arm, instagram: ig, agora: relogio, segredos });
  const worker = (dono = "w1") => criarWorker({ banco, armazenamento: arm, instagram: ig, agora: relogio, segredos, dono, aleatorio: () => 0.5 });
  const avancar = (min) => { rel.t = new Date(Date.parse(rel.t) + min * 60e3).toISOString(); };
  const chamar = async (usuario, metodo, caminho, corpo, consulta) => {
    const r = await api.tratar({ metodo, caminho, corpo: corpo || {}, consulta: consulta || {}, usuario });
    if (r.excecao) throw r.excecao;
    return r;
  };
  // Usuário com espaço, conta do Instagram conectada (simulada) e um vídeo pronto.
  async function preparar(usuario, { conectar = true } = {}) {
    await chamar(usuario, "POST", "/v1/organizacoes", { nome: "Espaço " + usuario.id });
    const eu = (await chamar(usuario, "GET", "/v1/eu")).corpo;
    if (conectar) await banco.inserir("conexoes", { org_id: eu.org.id, rede: "instagram", ig_user_id: "178" + usuario.id, usuario_rede: "conta_" + usuario.id, estado: "ativa", token_cifrado: await cifrar("token-de-teste", segredos.chaveCifra), simulado: false, token_expira_em: "2099-01-01T00:00:00.000Z", atualizado_em: rel.t });
    const video = await enviar(usuario, "video", "video/mp4", 1000);
    const capa = await enviar(usuario, "capa", "image/jpeg", 100);
    return { org: eu.org, video, capa };
  }
  async function enviar(usuario, tipo, mime, tamanho) {
    const r = await chamar(usuario, "POST", "/v1/midias", { tipo, mime, tamanho, nome: tipo });
    if (r.status !== 200) throw new Error(JSON.stringify(r.corpo));
    arm.receber(r.corpo.midia.caminho, tamanho, mime);
    return (await chamar(usuario, "POST", `/v1/midias/${r.corpo.midia.id}/finalizar`)).corpo.midia;
  }
  return { rel, relogio, banco, arm, ig, api, worker, avancar, chamar, preparar, enviar };
}
export const A = { id: "a", email: "a@x" };
export const B = { id: "b", email: "b@x" };
