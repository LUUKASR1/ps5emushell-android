/**
 * LibraryView — grade de jogos com filtros, busca e ordenação.
 *
 * Porte de `views/library/library-view.js`. A filtragem/ordenação vem de
 * `libraryModel.ts` (testado contra os testes do original); aqui fica apenas
 * a apresentação e a navegação.
 *
 * A busca usa um <input> comum por enquanto: o teclado virtual do PS5 (feito
 * para controle) ainda não foi portado, e o teclado do sistema resolve o caso
 * no Odin sem travar o resto da tela.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useZoneNav } from '../../navigation/zoneNav';
import { usePlatform } from '../../platform';
import { useShellStore } from '../../store/shellStore';
import type { Game } from '../../store/types';
import {
  DEFAULT_LIBRARY_FILTER,
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORTS,
  countLibraryGames,
  filterLibraryGames,
  findSortLabel,
  formatGameCount,
  moveInGrid,
} from './libraryModel';
import type { LibrarySort } from './libraryModel';

const GRID_GAP_PX = 14;
const MIN_CARD_PX = 148;

interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export function LibraryView() {
  const games = useShellStore((state) => state.games);
  const stats = useShellStore((state) => state.stats);
  const config = useShellStore((state) => state.config);
  const setLaunching = useShellStore((state) => state.setLaunching);
  const launcher = usePlatform().adapters.launcher;

  const [filter, setFilter] = useState<string>(DEFAULT_LIBRARY_FILTER);
  const [sort, setSort] = useState<LibrarySort['id']>(DEFAULT_LIBRARY_SORT);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [columns, setColumns] = useState(4);

  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const systems = config?.systems ?? [];

  // ─── Dados ─────────────────────────────────────────────────────────────────

  const visible = useMemo(
    () => filterLibraryGames({ games, gameStats: stats, filter, sort, query }),
    [games, stats, filter, sort, query],
  );

  const counts = useMemo(() => countLibraryGames({ games, gameStats: stats }), [games, stats]);

  const filters = useMemo<FilterOption[]>(() => {
    const options: FilterOption[] = [
      { id: 'all', label: 'Todos os jogos', count: games.length },
      { id: 'fav', label: 'Favoritos', count: counts.favorites },
      { id: 'recent', label: 'Jogados recentemente', count: counts.recent },
    ];
    for (const system of systems) {
      const count = counts.bySystem[system.id] ?? 0;
      if (count > 0) {
        options.push({ id: system.id, label: system.name, count });
      }
    }
    return options;
  }, [games.length, counts, systems]);

  // Mantém a seleção dentro da lista ao filtrar.
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, sort, query]);

  // ─── Medidas da grade ──────────────────────────────────────────────────────

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      const next = Math.max(1, Math.floor(width / (MIN_CARD_PX + GRID_GAP_PX)));
      setColumns(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ─── Ações ─────────────────────────────────────────────────────────────────

  const activate = (game: Game) => {
    setLaunching(true, game.id);
    const result = launcher.startGame({
      game,
      onExit: () => useShellStore.getState().setGameRunning(false),
    });
    if (!result.ok) {
      setLaunching(false);
      console.warn('[library] falha ao iniciar:', result.error);
    }
  };

  const cycleSort = (step: number) => {
    const index = LIBRARY_SORTS.findIndex((option) => option.id === sort);
    const next = (index + step + LIBRARY_SORTS.length) % LIBRARY_SORTS.length;
    const option = LIBRARY_SORTS[next];
    if (option) setSort(option.id);
  };

  // ─── Navegação ─────────────────────────────────────────────────────────────

  const { zone } = useZoneNav<'filters' | 'grid' | 'tools'>({
    zones: ['tools', 'filters', 'grid'],
    initial: 'grid',
    handlers: {
      tools: {
        onLeft: () => cycleSort(-1),
        onRight: () => cycleSort(1),
        onConfirm: () => searchRef.current?.focus(),
      },
      filters: {
        onUp: () => {
          const index = filters.findIndex((option) => option.id === filter);
          // No topo da lista, devolve o foco à zona de cima.
          if (index <= 0) return false;
          const previous = filters[index - 1];
          if (previous) setFilter(previous.id);
          return true;
        },
        onDown: () => {
          const index = filters.findIndex((option) => option.id === filter);
          if (index < 0 || index >= filters.length - 1) return false;
          const next = filters[index + 1];
          if (next) setFilter(next.id);
          return true;
        },
        onConfirm: () => {
          // A seleção já é aplicada ao mover; confirmar desce para a grade.
        },
      },
      grid: {
        onLeft: () => setSelectedIndex((i) => moveInGrid({ index: i, direction: 'left', columns, total: visible.length })),
        onRight: () => setSelectedIndex((i) => moveInGrid({ index: i, direction: 'right', columns, total: visible.length })),
        onUp: () => {
          const next = moveInGrid({ index: selectedIndex, direction: 'up', columns, total: visible.length });
          // Já na primeira linha: cede o foco para a zona de cima.
          if (next === selectedIndex) return false;
          setSelectedIndex(next);
          return true;
        },
        onDown: () => {
          const next = moveInGrid({ index: selectedIndex, direction: 'down', columns, total: visible.length });
          if (next === selectedIndex) return false;
          setSelectedIndex(next);
          return true;
        },
        onConfirm: () => {
          const game = visible[selectedIndex];
          if (game) activate(game);
        },
      },
    },
    global: {
      onL1: () => cycleSort(-1),
      onR1: () => cycleSort(1),
      onSearch: () => searchRef.current?.focus(),
    },
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="view view-library">
      <aside className={`lib-side ${zone === 'filters' ? 'zone-focused' : ''}`}>
        <h2>Biblioteca de jogos</h2>
        <div className="lib-filters">
          {filters.map((option) => (
            <button
              key={option.id}
              className={`lib-filter ${option.id === filter ? 'active' : ''}`}
              onClick={() => setFilter(option.id)}
            >
              <span className="lf-label">{option.label}</span>
              <span className="lf-count">{option.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="lib-main">
        <div className="lib-head">
          <div className="lib-title">
            <span className="lib-heading">
              {query ? `Busca: "${query}"` : filters.find((f) => f.id === filter)?.label ?? 'Todos os jogos'}
            </span>
            <span className="lib-count">{formatGameCount(visible.length)}</span>
          </div>

          <div className={`lib-tools ${zone === 'tools' ? 'zone-focused' : ''}`}>
            <button className="btn-pill" onClick={() => cycleSort(1)}>
              {findSortLabel(sort)}
            </button>
            <input
              ref={searchRef}
              className="lib-search"
              type="search"
              placeholder="Buscar…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="lib-empty">
            <p>Nenhum jogo corresponde a este filtro.</p>
          </div>
        ) : (
          <div
            className="lib-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {visible.map((game, index) => (
              <button
                key={game.id}
                className={`game-card ${index === selectedIndex && zone === 'grid' ? 'sel' : ''}`}
                onClick={() => {
                  if (index === selectedIndex) activate(game);
                  else setSelectedIndex(index);
                }}
              >
                {game.cover ? (
                  <img src={game.cover} alt="" className="gc-cover" draggable={false} />
                ) : (
                  <div className="gc-placeholder">
                    <span>{game.title}</span>
                  </div>
                )}
                <div className="gc-meta">
                  <span className="gc-title">{game.title}</span>
                  <span className="gc-system">
                    {systems.find((system) => system.id === game.system)?.shortName ?? game.system}
                  </span>
                </div>
                {stats[game.id]?.favorite && <span className="gc-fav">★</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
