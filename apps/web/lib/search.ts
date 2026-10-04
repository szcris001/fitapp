// Normaliza texto para búsqueda: minúsculas y sin tildes/diacríticos, para que
// "jose" encuentre "José" y viceversa.
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
