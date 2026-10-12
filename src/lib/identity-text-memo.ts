// Cada memoizador tiene un límite explícito. Los cuatro parsers de producto
// suman 1024 entradas; las tres pruebas puras de calidad suman otras 640.
// No guardan Product/Price ni elegibilidad; sólo resultados puros del string.
export const IDENTITY_TEXT_MEMO_ENTRIES = 1024;
export const IDENTITY_TEXT_MEMO_LENGTH = 2048;
type MemoValue = string | number | boolean | null | MemoValue[] | { [key: string]: MemoValue };

function freezeValue<T extends MemoValue>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}

/** Copia privada congelada; cada retorno mutable pertenece a su consumidor. */
export function createBoundedIdentityTextMemo<T extends MemoValue>(
  compute: (text: string) => T,
  copy: (value: T) => T,
  maxEntries = 256,
): (text: string) => T {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > IDENTITY_TEXT_MEMO_ENTRIES)
    throw new Error('IDENTITY_TEXT_MEMO_LIMIT_INVALID');
  const entries = new Map<string, T>();
  return (text: string): T => {
    // Conservar también el comportamiento runtime del parser ante valores
    // fuera de su tipo; nunca almacenar claves de objeto o texto enorme.
    if (typeof text !== 'string' || text.length > IDENTITY_TEXT_MEMO_LENGTH) return compute(text);
    if (entries.has(text)) {
      const cached = entries.get(text)!;
      entries.delete(text); entries.set(text, cached);
      return copy(cached);
    }
    const result = compute(text);
    entries.set(text, freezeValue(copy(result)));
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    return result;
  };
}
