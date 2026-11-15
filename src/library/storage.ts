/**
 * Persistência em JSON — porte de `main/core/json-file.js` + `app-paths.js`.
 *
 * No original os arquivos ficavam em `launcher/data/` ao lado do executável.
 * No Android ficam na área privada do app (`context.filesDir/data`), que é o
 * único lugar gravável sem permissão extra — e o único que sobrevive a
 * atualização do APK sem virar lixo.
 *
 * Os nomes de arquivo são os mesmos do original, para facilitar migrar dados.
 */

import { ShellNative, hasNativeBridge } from '../platform/android-adapters';
import { parseJsonOrDefault, serializeJson } from './jsonFile.ts';

export const DATA_FILES = {
  config: 'config.json',
  stats: 'stats.json',
  library: 'library.json',
  collections: 'collections.json',
} as const;

// ─── Localização do diretório de dados ────────────────────────────────────────

let dataDirPromise: Promise<string> | null = null;

const resolveDataDir = (): Promise<string> => {
  if (!dataDirPromise) {
    dataDirPromise = (async () => {
      if (!hasNativeBridge()) return 'web';
      try {
        const paths = await ShellNative.appGetPaths();
        return paths.dataDir;
      } catch {
        return 'web';
      }
    })();
  }
  return dataDirPromise;
};

/** Usado nos testes para injetar um diretório. */
export const __setDataDirForTests = (dir: string): void => {
  dataDirPromise = Promise.resolve(dir);
};

// ─── Backends ─────────────────────────────────────────────────────────────────

interface StorageBackend {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<boolean>;
}

const nativeBackend: StorageBackend = {
  async read(name) {
    const dir = await resolveDataDir();
    try {
      const result = await ShellNative.fsReadText({ path: `${dir}/${name}` });
      return result.content ?? null;
    } catch {
      return null;
    }
  },
  async write(name, content) {
    const dir = await resolveDataDir();
    try {
      const result = await ShellNative.fsWriteText({
        path: `${dir}/${name}`,
        content,
      });
      return result.ok;
    } catch {
      return false;
    }
  },
};

/**
 * Backend de desenvolvimento no navegador.
 * localStorage é adequado aqui: são poucos KB de config e o objetivo é não
 * perder o estado a cada reload durante o desenvolvimento da UI.
 */
const webBackend: StorageBackend = {
  async read(name) {
    try {
      return globalThis.localStorage?.getItem(`ps5emushell:${name}`) ?? null;
    } catch {
      return null;
    }
  },
  async write(name, content) {
    try {
      globalThis.localStorage?.setItem(`ps5emushell:${name}`, content);
      return true;
    } catch {
      return false;
    }
  },
};

const backend = (): StorageBackend => (hasNativeBridge() ? nativeBackend : webBackend);

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Lê e valida um JSON.
 *
 * Devolve o fallback em qualquer problema — arquivo ausente, JSON corrompido
 * por escrita interrompida, ou formato antigo. É preferível abrir com a
 * configuração padrão a travar na inicialização por causa de um arquivo ruim.
 */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const raw = await backend().read(name);
  if (raw === null) return fallback;
  return parseJsonOrDefault(raw, fallback);
}

export async function writeJson(name: string, value: unknown): Promise<boolean> {
  try {
    return await backend().write(name, serializeJson(value));
  } catch (error) {
    console.error(`[storage] falha ao gravar ${name}`, error);
    return false;
  }
}

// ─── Gravação com debounce ────────────────────────────────────────────────────

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Agenda a gravação. Alterações de estado (favoritar, mudar tema) acontecem em
 * rajada; sem debounce cada clique viraria uma escrita em disco.
 */
export function scheduleWrite(name: string, value: () => unknown, delayMs = 800): void {
  const existing = pending.get(name);
  if (existing) clearTimeout(existing);

  pending.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      void writeJson(name, value());
    }, delayMs),
  );
}

/** Grava imediatamente tudo que estiver pendente (chamado ao sair). */
export async function flushPendingWrites(
  values: Record<string, () => unknown>,
): Promise<void> {
  const names = [...pending.keys()];
  for (const name of names) {
    const timer = pending.get(name);
    if (timer) clearTimeout(timer);
    pending.delete(name);
    const read = values[name];
    if (read) await writeJson(name, read());
  }
}
