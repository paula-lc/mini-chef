// Genera icons/icon-192.png e icon-512.png (sin dependencias). Uso: node tools/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const FONDO = [83, 176, 174];
const CREMA = [245, 236, 219];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function trozo(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

function icono(n) {
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      let col = FONDO;
      // cuenco: medio círculo inferior (centro 0.5,0.52, radio 0.26)
      const dx = u - 0.5, dy = v - 0.52;
      if (v >= 0.52 && dx * dx + dy * dy <= 0.26 * 0.26) col = CREMA;
      // borde del cuenco
      if (v >= 0.50 && v <= 0.545 && Math.abs(dx) <= 0.30) col = CREMA;
      // tres hilos de vapor
      for (const sx of [0.38, 0.5, 0.62]) {
        if (Math.abs(u - sx) <= 0.017 && v >= 0.24 && v <= 0.42) col = CREMA;
      }
      const o = y * (n * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr), trozo('IDAT', deflateSync(raw)), trozo('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const n of [192, 512]) writeFileSync(new URL(`icon-${n}.png`, dir), icono(n));

writeFileSync(new URL('icon.svg', dir), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#53B0AE"/>
  <path d="M102 256h308a0 0 0 0 1 0 0 154 154 0 0 1-308 0z" fill="#F5ECDB"/>
  <rect x="97" y="256" width="318" height="23" fill="#F5ECDB"/>
  <g fill="#F5ECDB"><rect x="185" y="123" width="17" height="92" rx="8"/><rect x="247" y="123" width="17" height="92" rx="8"/><rect x="310" y="123" width="17" height="92" rx="8"/></g>
</svg>
`);
console.log('Iconos generados');
