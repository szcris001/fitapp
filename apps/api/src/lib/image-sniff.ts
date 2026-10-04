// Firma de bytes real del archivo — el Content-Type del multipart lo declara el cliente,
// así que un .txt o .pdf renombrado con type=image/png pasaría un filtro que solo mira
// data.mimetype. Devuelve la extensión real, o null si no es ninguna de las 3 imágenes
// soportadas, sin importar qué haya declarado el cliente.
export function detectImageExt(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return '.png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp'
  return null
}
