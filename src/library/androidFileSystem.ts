/**
 * Implementações de `RomFileSystem` para o scanner.
 *
 * O scanner recebe o sistema de arquivos por injeção (ver scanner.ts). Aqui
 * ficam as duas implementações concretas:
 *
 *   - `createAndroidFileSystem()` fala com o plugin ShellNative.
 *   - `createEmptyFileSystem()` devolve tudo vazio, para o modo web, onde não
 *     há acesso a disco. A UI mostra o estado vazio em vez de quebrar.
 */

import { ShellNative, hasNativeBridge } from '../platform/android-adapters';
import type { DirEntry, FileStat, RomFileSystem } from './scanner';

export function createAndroidFileSystem(): RomFileSystem {
  return {
    async listDir(dir: string): Promise<DirEntry[]> {
      if (!hasNativeBridge()) return [];
      try {
        const result = await ShellNative.fsListDir({ path: dir });
        return result.entries ?? [];
      } catch {
        return [];
      }
    },

    async stat(file: string): Promise<FileStat | null> {
      if (!hasNativeBridge()) return null;
      try {
        const result = await ShellNative.fsStat({ path: file });
        if (!result.exists) return null;
        return {
          size: result.size ?? 0,
          birthtimeMs: result.birthtimeMs ?? 0,
          mtimeMs: result.mtimeMs ?? 0,
        };
      } catch {
        return null;
      }
    },

    async readText(file: string): Promise<string | null> {
      if (!hasNativeBridge()) return null;
      try {
        const result = await ShellNative.fsReadText({ path: file });
        return result.content ?? null;
      } catch {
        return null;
      }
    },
  };
}

export function createEmptyFileSystem(): RomFileSystem {
  return {
    async listDir() {
      return [];
    },
    async stat() {
      return null;
    },
    async readText() {
      return null;
    },
  };
}

/** Escolhe a implementação conforme a plataforma. */
export const createRomFileSystem = (): RomFileSystem =>
  hasNativeBridge() ? createAndroidFileSystem() : createEmptyFileSystem();
