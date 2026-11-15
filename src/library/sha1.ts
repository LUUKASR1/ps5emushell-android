/**
 * SHA-1 em JavaScript puro.
 *
 * O original gerava o id do jogo com `node:crypto` (`createHash('sha1')`).
 * Isso não existe no WebView do Android nem no navegador de desenvolvimento,
 * e o Vite não consegue empacotar `node:crypto` sem polyfill.
 *
 * A alternativa seria trocar o algoritmo — mas aí os ids deixariam de casar com
 * os do launcher de PC, o que atrapalharia quem for migrar a biblioteca.
 * Implementação própria mantém os ids idênticos e roda em qualquer lugar.
 *
 * Segurança não é requisito aqui: o hash serve só como identificador estável
 * de uma ROM, não como proteção.
 */

const encoder = new TextEncoder();

const rotl = (value: number, bits: number): number =>
  ((value << bits) | (value >>> (32 - bits))) >>> 0;

export const sha1Hex = (input: string): string => {
  const bytes = encoder.encode(input);
  const bitLength = bytes.length * 8;

  // Mensagem + 0x80 + padding até 56 mod 64 + 8 bytes de tamanho.
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6) >>> 0;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // Tamanho em bits, big-endian de 64 bits (dois words de 32).
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;

      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
};
