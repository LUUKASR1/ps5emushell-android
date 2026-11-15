/**
 * Núcleo de leitura/escrita de JSON — porte de `main/core/json-file.js`.
 *
 * Separado de `storage.ts` (que importa o Capacitor) para poder ser testado em
 * Node sem simular a ponte nativa. Toda a decisão de "o que fazer quando o
 * arquivo está ruim" mora aqui.
 */

/**
 * Interpreta um JSON devolvendo o padrão em qualquer falha.
 *
 * Um arquivo de configuração corrompido — escrita interrompida, edição manual,
 * versão antiga — não deve impedir o app de abrir. O original fazia o mesmo
 * com `readJsonFileOrDefault`.
 */
export function parseJsonOrDefault<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw.trim() === '') return fallback;

  try {
    const parsed = JSON.parse(raw) as T;
    // `null` explícito no arquivo também cai no padrão: nenhum dos nossos
    // arquivos é legitimamente nulo na raiz.
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Serializa com indentação — os arquivos são legíveis e versionáveis. */
export function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
