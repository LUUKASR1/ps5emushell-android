/**
 * Subconjunto de `node:path` (POSIX) usado pelo scanner.
 *
 * O original rodava no processo main do Electron e usava `node:path` com
 * separador de Windows. No Android os caminhos são POSIX, e no WebView não
 * existe módulo `path` — daí este subconjunto mínimo, sem dependências.
 *
 * Só cobre o que o scanner precisa; não é uma reimplementação completa.
 */

export const extname = (input: string): string => {
  const base = basename(input);
  const dot = base.lastIndexOf('.');
  // Arquivo começando com ponto (".nomedia") não tem extensão.
  return dot <= 0 ? '' : base.slice(dot);
};

export const basename = (input: string, stripExt?: string): string => {
  const trimmed = input.replace(/\/+$/, '');
  if (!trimmed) return '';
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  if (stripExt && base.endsWith(stripExt)) {
    return base.slice(0, base.length - stripExt.length);
  }
  return base;
};

export const dirname = (input: string): string => {
  const trimmed = input.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return trimmed.slice(0, index);
};

export const join = (...parts: string[]): string => {
  const filtered = parts.filter((part) => part.length > 0);
  if (filtered.length === 0) return '';
  return normalize(filtered.join('/'));
};

/** Resolve a segunda parte contra a primeira, como `path.resolve` aninhado. */
export const resolve = (base: string, relative: string): string => {
  if (relative.startsWith('/')) return normalize(relative);
  return normalize(`${base.replace(/\/+$/, '')}/${relative}`);
};

export const isAbsolute = (input: string): boolean => input.startsWith('/');

/** Remove `.` e resolve `..` sem tocar no sistema de arquivos. */
export const normalize = (input: string): string => {
  const absolute = input.startsWith('/');
  const segments = input.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else if (!absolute) stack.push('..');
      continue;
    }
    stack.push(segment);
  }

  const joined = stack.join('/');
  if (absolute) return `/${joined}`;
  return joined || '.';
};
