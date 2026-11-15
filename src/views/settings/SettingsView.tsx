/**
 * SettingsView — configuração do launcher.
 *
 * Porte reduzido de `views/settings/`. Do original foram mantidas as partes
 * que o port Android realmente precisa hoje:
 *
 *   - pasta de ROMs por sistema + ligar/desligar sistema
 *   - revarrer a biblioteca
 *   - tema
 *
 * Ficaram de fora (dependem de subsistemas ainda não portados): instalação de
 * emuladores, RetroAchievements, atalhos, otimização e capas.
 */

import { useMemo, useState } from 'react';
import { useZoneNav } from '../../navigation/zoneNav';
import { useShellStore } from '../../store/shellStore';
import type { ShellConfig, SystemDef } from '../../store/types';

type Section = 'library' | 'systems' | 'appearance' | 'about';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'library', label: 'Biblioteca' },
  { id: 'systems', label: 'Sistemas e emuladores' },
  { id: 'appearance', label: 'Aparência' },
  { id: 'about', label: 'Sobre' },
];

export function SettingsView() {
  const config = useShellStore((state) => state.config);
  const games = useShellStore((state) => state.games);
  const isScanning = useShellStore((state) => state.isScanning);
  const version = useShellStore((state) => state.version);
  const saveConfig = useShellStore((state) => state.saveConfig);
  const rescanLibrary = useShellStore((state) => state.rescanLibrary);
  const setView = useShellStore((state) => state.setView);

  const [section, setSection] = useState<Section>('library');
  const [rowIndex, setRowIndex] = useState(0);

  const systems = config?.systems ?? [];
  const enabledCount = useMemo(
    () => systems.filter((system) => system.enabled !== false).length,
    [systems],
  );

  const updateSystem = (id: string, patch: Partial<SystemDef>) => {
    if (!config) return;
    const next: ShellConfig = {
      ...config,
      systems: systems.map((system) =>
        system.id === id ? { ...system, ...patch } : system,
      ),
    };
    saveConfig(next);
  };

  const setTheme = (theme: 'dark' | 'light') => {
    if (!config) return;
    saveConfig({ ...config, appearance: { ...config.appearance, theme } });
    document.documentElement.dataset.theme = theme;
  };

  // ─── Navegação ─────────────────────────────────────────────────────────────

  const sectionIndex = SECTIONS.findIndex((entry) => entry.id === section);

  const menuHandlers = {
    onUp: () => {
      if (sectionIndex <= 0) return false;
      setSection(SECTIONS[sectionIndex - 1]!.id);
      setRowIndex(0);
      return true;
    },
    onDown: () => {
      if (sectionIndex >= SECTIONS.length - 1) return false;
      setSection(SECTIONS[sectionIndex + 1]!.id);
      setRowIndex(0);
      return true;
    },
  };

  const { zone } = useZoneNav<'menu' | 'content'>({
    zones: ['menu', 'content'],
    initial: 'menu',
    handlers: {
      menu: menuHandlers,
      content: {
        onUp: () => {
          if (rowIndex <= 0) return false;
          setRowIndex(rowIndex - 1);
          return true;
        },
        onDown: () => {
          if (rowIndex >= systems.length - 1) return false;
          setRowIndex(rowIndex + 1);
          return true;
        },
        onConfirm: () => {
          if (section !== 'systems') return;
          const target = systems[rowIndex];
          if (target) updateSystem(target.id, { enabled: target.enabled === false });
        },
      },
    },
    global: {
      onBack: () => setView('home'),
    },
  });

  if (!config) {
    return (
      <section className="view view-settings">
        <p className="set-loading">Carregando configuração…</p>
      </section>
    );
  }

  return (
    <section className="view view-settings">
      <aside className={`set-side ${zone === 'menu' ? 'zone-focused' : ''}`}>
        <h2>Configurações</h2>
        <div className="set-nav">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              className={`set-nav-item ${entry.id === section ? 'active' : ''}`}
              onClick={() => {
                setSection(entry.id);
                setRowIndex(0);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="set-main">
        {section === 'library' && (
          <>
            <h3 className="set-heading">Biblioteca</h3>
            <p className="set-desc">
              {games.length} jogos encontrados · {enabledCount} sistemas ativos
            </p>
            <div className="set-actions">
              <button className="btn-play" onClick={() => void rescanLibrary()} disabled={isScanning}>
                {isScanning ? 'Varrendo…' : 'Buscar jogos'}
              </button>
            </div>
            <p className="set-hint">
              As ROMs são procuradas nas pastas definidas em “Sistemas e emuladores”.
              Pastas fora do armazenamento compartilhado precisam ser liberadas
              nas permissões do app.
            </p>
          </>
        )}

        {section === 'systems' && (
          <>
            <h3 className="set-heading">Sistemas e emuladores</h3>
            <p className="set-desc">
              Ative só os sistemas que você usa — cada um aponta para uma pasta.
            </p>
            <div className={`set-systems ${zone === 'content' ? 'zone-focused' : ''}`}>
              {systems.map((system, index) => (
                <div
                  key={system.id}
                  className={`set-system ${index === rowIndex && zone === 'content' ? 'sel' : ''}`}
                >
                  <button
                    className={`set-toggle ${system.enabled !== false ? 'on' : ''}`}
                    onClick={() => updateSystem(system.id, { enabled: system.enabled === false })}
                    aria-label={system.enabled !== false ? 'Desativar' : 'Ativar'}
                  >
                    {system.enabled !== false ? '●' : '○'}
                  </button>
                  <span className="set-system-name">{system.name}</span>
                  <input
                    className="set-input"
                    type="text"
                    value={system.romDirs[0] ?? ''}
                    onChange={(event) =>
                      updateSystem(system.id, { romDirs: [event.target.value] })
                    }
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'appearance' && (
          <>
            <h3 className="set-heading">Aparência</h3>
            <div className="set-actions">
              <button
                className={`btn-pill ${config.appearance.theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Tema escuro
              </button>
              <button
                className={`btn-pill ${config.appearance.theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Tema claro
              </button>
            </div>
            <div className="set-actions">
              <button
                className={`btn-pill ${config.appearance.motionEnabled ? 'active' : ''}`}
                onClick={() =>
                  saveConfig({
                    ...config,
                    appearance: {
                      ...config.appearance,
                      motionEnabled: !config.appearance.motionEnabled,
                    },
                  })
                }
              >
                Animações {config.appearance.motionEnabled ? 'ligadas' : 'desligadas'}
              </button>
            </div>
          </>
        )}

        {section === 'about' && (
          <>
            <h3 className="set-heading">Sobre</h3>
            <p className="set-desc">PS5 Emu Shell para Android · versão {version || '—'}</p>
            <p className="set-hint">
              Port do launcher original para Windows. Não é um emulador: apenas
              organiza a biblioteca e abre cada jogo no emulador certo.
            </p>
            <p className="set-hint">
              Licença MIT. O launcher não distribui jogos, BIOS ou firmwares.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
