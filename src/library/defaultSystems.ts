/**
 * Catálogo padrão de sistemas para o port Android.
 *
 * O original trazia isso em `main/defaults/` apontando para `roms\<sistema>`
 * relativo à pasta base no Windows. No Android não existe "pasta ao lado do
 * executável": o app precisa de caminhos absolutos no armazenamento
 * compartilhado, então a raiz padrão é uma pasta própria do launcher e o
 * usuário pode trocar em Configurações.
 *
 * As extensões e os arquivos-capa por sistema vêm do catálogo original.
 */

import type { SystemDef } from '../store/types';

export const DEFAULT_ROM_ROOT = '/storage/emulated/0/PS5EmuShell/roms';

const system = (
  id: string,
  name: string,
  shortName: string,
  color: string,
  extensions: string[],
  gameFiles?: string[],
): SystemDef => ({
  id,
  name,
  shortName,
  color,
  enabled: true,
  romDirs: [`${DEFAULT_ROM_ROOT}/${id}`],
  extensions,
  ...(gameFiles ? { gameFiles } : {}),
});

export const DEFAULT_SYSTEMS: SystemDef[] = [
  system('psx', 'PlayStation', 'PSX', '#3b7dd8', ['cue', 'bin', 'iso', 'chd', 'pbp']),
  system('ps2', 'PlayStation 2', 'PS2', '#2f6fd0', ['iso', 'bin', 'chd', 'cso']),
  system('psp', 'PlayStation Portable', 'PSP', '#4a6fd4', ['iso', 'cso', 'pbp']),
  system('nds', 'Nintendo DS', 'NDS', '#c0392b', ['nds', 'zip', '7z']),
  system('3ds', 'Nintendo 3DS', '3DS', '#d04545', ['3ds', 'cia', 'cci']),
  system('gba', 'Game Boy Advance', 'GBA', '#8e44ad', ['gba', 'zip']),
  system('gbc', 'Game Boy Color', 'GBC', '#9b59b6', ['gbc', 'gb', 'zip']),
  system('snes', 'Super Nintendo', 'SNES', '#7d3c98', ['sfc', 'smc', 'zip']),
  system('nes', 'Nintendo (NES)', 'NES', '#a569bd', ['nes', 'zip']),
  system('n64', 'Nintendo 64', 'N64', '#2e86c1', ['n64', 'z64', 'v64', 'zip']),
  system('gc', 'GameCube', 'GC', '#7f8c8d', ['iso', 'gcm', 'rvz'], ['boot.bin', 'start.dol']),
  system('wii', 'Wii', 'Wii', '#95a5a6', ['iso', 'wbfs', 'rvz']),
  system('genesis', 'Mega Drive / Genesis', 'MD', '#1e6091', ['md', 'gen', 'bin', 'zip']),
  system('dreamcast', 'Dreamcast', 'DC', '#e67e22', ['gdi', 'cdi', 'chd']),
  system('switch', 'Nintendo Switch', 'NSW', '#e74c3c', ['nsp', 'xci']),
];

/** Mapa id -> sistema, para consultas rápidas em render. */
export const SYSTEMS_BY_ID = new Map(DEFAULT_SYSTEMS.map((entry) => [entry.id, entry]));
