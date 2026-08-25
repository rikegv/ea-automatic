/*
 * Verificacao Ed25519 (RFC 8032), SO verificacao, para uso no navegador.
 *
 * Caminho primario: WebCrypto (crypto.subtle) com algoritmo "Ed25519", disponivel nos navegadores
 * recentes. Fallback: implementacao pura em JS (BigInt + coordenadas estendidas), usando
 * crypto.subtle.digest("SHA-512") para o hash. Assim a verificacao de UX funciona em qualquer
 * celular moderno. A verificacao AUTORITATIVA acontece no servidor (Cloud Function), sempre.
 *
 * Exporta window.Ed25519.verify(sig, msg, pub) -> Promise<boolean>, com sig(64)/pub(32)/msg como
 * Uint8Array.
 */
(function (global) {
  "use strict";

  const P = (1n << 255n) - 19n;
  // Ordem do subgrupo (L).
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;

  function mod(a, m) {
    m = m || P;
    const r = a % m;
    return r >= 0n ? r : r + m;
  }
  function expmod(b, e, m) {
    b = mod(b, m);
    let r = 1n;
    while (e > 0n) {
      if (e & 1n) r = mod(r * b, m);
      b = mod(b * b, m);
      e >>= 1n;
    }
    return r;
  }
  function inv(a) {
    return expmod(a, P - 2n, P);
  }

  const D = mod(-121665n * inv(121666n));
  const D2 = mod(2n * D);
  const SQRT_M1 = expmod(2n, (P - 1n) / 4n, P);

  // Ponto base B (constantes padrao do edwards25519).
  const B = {
    X: 15112221349535400772501151409588531511454012693041857206046113283949847762202n,
    Y: 46316835694926478169428394003475163141307993866256225615783033603165251855960n,
    Z: 1n,
  };
  B.T = mod(B.X * B.Y);

  const IDENTIDADE = { X: 0n, Y: 1n, Z: 1n, T: 0n };

  // Adicao unificada em coordenadas estendidas (completa em edwards25519; serve p/ dobrar tambem).
  function ptAdd(A, C) {
    const a = mod((A.Y - A.X) * (C.Y - C.X));
    const b = mod((A.Y + A.X) * (C.Y + C.X));
    const c = mod(A.T * D2 * C.T);
    const dd = mod(A.Z * 2n * C.Z);
    const e = b - a;
    const f = dd - c;
    const g = dd + c;
    const h = b + a;
    return { X: mod(e * f), Y: mod(g * h), Z: mod(f * g), T: mod(e * h) };
  }

  function scalarMult(point, k) {
    let q = IDENTIDADE;
    let base = point;
    while (k > 0n) {
      if (k & 1n) q = ptAdd(q, base);
      base = ptAdd(base, base);
      k >>= 1n;
    }
    return q;
  }

  function ptEqual(A, C) {
    return mod(A.X * C.Z) === mod(C.X * A.Z) && mod(A.Y * C.Z) === mod(C.Y * A.Z);
  }

  function leToBig(bytes) {
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    return n;
  }

  function decodePoint(bytes) {
    let y = leToBig(bytes);
    const sign = (y >> 255n) & 1n;
    y = y & ((1n << 255n) - 1n);
    if (y >= P) return null;
    const y2 = mod(y * y);
    const u = mod(y2 - 1n);
    const v = mod(D * y2 + 1n);
    const uv = mod(u * inv(v));
    let x = expmod(uv, (P + 3n) / 8n, P);
    if (mod(x * x) !== uv) x = mod(x * SQRT_M1);
    if (mod(x * x) !== uv) return null;
    if ((x & 1n) !== sign) x = mod(P - x);
    return { X: x, Y: y, Z: 1n, T: mod(x * y) };
  }

  async function sha512(bytes) {
    const buf = await global.crypto.subtle.digest("SHA-512", bytes);
    return new Uint8Array(buf);
  }

  async function verifyPuro(sig, msg, pub) {
    if (sig.length !== 64 || pub.length !== 32) return false;
    const Rbytes = sig.subarray(0, 32);
    const sBytes = sig.subarray(32, 64);
    const s = leToBig(sBytes);
    if (s >= L) return false;

    const A = decodePoint(pub);
    if (!A) return false;
    const R = decodePoint(Rbytes);
    if (!R) return false;

    const data = new Uint8Array(64 + msg.length);
    data.set(Rbytes, 0);
    data.set(pub, 32);
    data.set(msg, 64);
    const k = mod(leToBig(await sha512(data)), L);

    const sB = scalarMult(B, s);
    const kA = scalarMult(A, k);
    return ptEqual(sB, ptAdd(R, kA));
  }

  async function verifyWebCrypto(sig, msg, pub) {
    const key = await global.crypto.subtle.importKey(
      "raw",
      pub,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return global.crypto.subtle.verify({ name: "Ed25519" }, key, sig, msg);
  }

  async function verify(sig, msg, pub) {
    try {
      return await verifyWebCrypto(sig, msg, pub);
    } catch (_e) {
      // WebCrypto sem suporte a Ed25519 (ou chave nao importavel): cai no verificador puro.
      return verifyPuro(sig, msg, pub);
    }
  }

  global.Ed25519 = { verify };
})(typeof window !== "undefined" ? window : globalThis);
