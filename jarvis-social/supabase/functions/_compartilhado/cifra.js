// Tokens da Meta ficam cifrados no banco (AES-256-GCM). A chave vem do
// segredo JS_CHAVE_CIFRA do servidor (32 bytes em base64); nunca do frontend.
const b64 = {
  de: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  para: (u) => btoa(String.fromCharCode(...new Uint8Array(u))),
};
async function chave(chaveB64) {
  const bruta = b64.de(chaveB64);
  if (bruta.length !== 32) throw new Error("JS_CHAVE_CIFRA precisa ter 32 bytes em base64");
  return crypto.subtle.importKey("raw", bruta, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function cifrar(texto, chaveB64) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(chaveB64), new TextEncoder().encode(texto));
  return `v1.${b64.para(iv)}.${b64.para(c)}`;
}
export async function decifrar(pacote, chaveB64) {
  const [v, iv, c] = String(pacote).split(".");
  if (v !== "v1") throw new Error("formato de cifra desconhecido");
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.de(iv) }, await chave(chaveB64), b64.de(c));
  return new TextDecoder().decode(p);
}
export async function sha256Hex(texto) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Assinatura curta (HMAC) para o `state` do OAuth e o segredo do worker.
export async function hmac(texto, segredo) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function iguaisTempoConstante(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
