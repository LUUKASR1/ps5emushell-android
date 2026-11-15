/**
 * useControllerNav — navegação por controle.
 *
 * Substitui, para o escopo das views, três arquivos do original:
 *   input/button-router.js   (mapeamento de botões -> ações)
 *   navigation/spatial-navigation.js (foco espacial)
 *   input/keyboard-input.js  (setas e Enter como alternativa)
 *
 * A detecção de "pressionou agora" (borda de subida) é necessária porque o
 * adaptador entrega o ESTADO dos botões a cada frame, não eventos. O original
 * fazia o mesmo em button-state.js com previousButtons + repeatTimers; aqui a
 * lógica é a mesma, reduzida ao que as views de lista precisam.
 */

import { useEffect, useRef } from 'react';
import { usePlatform } from '../platform';

/** Botões que fazem sentido repetir quando segurados. */
const REPEATABLE = new Set(['left', 'right', 'up', 'down']);
const REPEAT_DELAY_MS = 420;
const REPEAT_INTERVAL_MS = 110;

export interface ControllerNavHandlers {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  /** L1/R1 — no original trocam de aba e de filtro. */
  onL1?: () => void;
  onR1?: () => void;
  onOptions?: () => void;
  onSearch?: () => void;
  onHome?: () => void;
}

interface HeldState {
  buttons: Set<string>;
  repeatAt: Map<string, number>;
}

export function useControllerNav(handlers: ControllerNavHandlers): void {
  const { pads } = usePlatform();

  // Mantém os handlers sempre atualizados sem reinstalar o efeito a cada render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const heldRef = useRef<HeldState>({ buttons: new Set(), repeatAt: new Map() });

  // ─── Controle: borda de subida lida do snapshot de estado ──────────────────

  useEffect(() => {
    const active = pads.find((pad) => pad.state?.connected);
    const current = new Set<string>(
      Object.entries(active?.state?.buttons ?? {})
        .filter(([, pressed]) => pressed)
        .map(([button]) => button),
    );

    const held = heldRef.current;
    const now = performance.now();

    for (const button of current) {
      if (!held.buttons.has(button)) {
        // primeira vez que este botão aparece pressionado
        dispatch(button, handlersRef.current);
        if (REPEATABLE.has(button)) held.repeatAt.set(button, now + REPEAT_DELAY_MS);
      } else if (REPEATABLE.has(button)) {
        const due = held.repeatAt.get(button);
        if (due !== undefined && now >= due) {
          dispatch(button, handlersRef.current);
          held.repeatAt.set(button, now + REPEAT_INTERVAL_MS);
        }
      }
    }

    for (const button of held.buttons) {
      if (!current.has(button)) held.repeatAt.delete(button);
    }

    held.buttons = current;
  }, [pads]);

  // ─── Teclado: mesmo mapeamento, para desenvolvimento e teclado físico ─────

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const button = KEY_MAP[event.key];
      if (!button) return;
      event.preventDefault();
      dispatch(button, handlersRef.current);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

// ─── Mapeamentos ──────────────────────────────────────────────────────────────

const KEY_MAP: Record<string, string> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'cross',
  ' ': 'cross',
  Escape: 'circle',
  Backspace: 'circle',
  Tab: 'r1',
};

function dispatch(button: string, handlers: ControllerNavHandlers): void {
  switch (button) {
    case 'left':
      handlers.onLeft?.();
      break;
    case 'right':
      handlers.onRight?.();
      break;
    case 'up':
      handlers.onUp?.();
      break;
    case 'down':
      handlers.onDown?.();
      break;
    // Mapeamento PlayStation: cruz confirma, círculo volta.
    case 'cross':
      handlers.onConfirm?.();
      break;
    case 'circle':
      handlers.onBack?.();
      break;
    case 'l1':
      handlers.onL1?.();
      break;
    case 'r1':
      handlers.onR1?.();
      break;
    case 'options':
      handlers.onOptions?.();
      break;
    case 'create':
      handlers.onSearch?.();
      break;
    case 'ps':
      handlers.onHome?.();
      break;
    default:
      break;
  }
}
