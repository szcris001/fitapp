// Para dedupe de nombres: minúsculas + sin tildes — "Sentadilla" y "Sentadillá"
// son el mismo movimiento para quien busca, aunque se hayan tipeado distinto.
export function normalizeMovementName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
