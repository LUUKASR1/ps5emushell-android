/**
 * PlatformProvider — React Context for Platform Adapters
 *
 * Provides platform-specific implementations to the entire component tree.
 * Defaults to web fallback adapters for browser development; swap in Android
 * adapters at the app root when running on device via Capacitor plugin bridge.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BatteryAdapter,
  BatteryStatus,
  PerfAdapter,
  PerfSample,
  ProcessAdapter,
  InputAdapter,
  PadInfo,
  LauncherAdapter,
  OptimizeAdapter,
  PlatformAdapters,
} from './types';
import {
  WebBatteryAdapter,
  WebPerfAdapter,
  WebProcessAdapter,
  WebInputAdapter,
  WebLauncherAdapter,
  WebOptimizeAdapter,
} from './web-adapters';
import { createAndroidAdapters, hasNativeBridge } from './android-adapters';

// ─── Context Shape ────────────────────────────────────────────────────────────

export interface PlatformContextValue {
  adapters: PlatformAdapters;
  battery: BatteryStatus | null;
  perfSample: PerfSample | null;
  pads: PadInfo[];
  isReady: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

// ─── Adapter Factory ──────────────────────────────────────────────────────────

type AdapterFactory = () => PlatformAdapters;

const createWebAdapters: AdapterFactory = () => ({
  battery: new WebBatteryAdapter(),
  perf: new WebPerfAdapter(),
  process: new WebProcessAdapter(),
  input: new WebInputAdapter(),
  launcher: new WebLauncherAdapter(),
  optimize: new WebOptimizeAdapter(),
});

/**
 * Escolhe o conjunto de adaptadores conforme a plataforma.
 * No Android com o plugin ShellNative registrado usa a camada nativa;
 * em qualquer outro caso cai nos adaptadores web, para o mesmo bundle
 * rodar em `npm run dev` sem gambiarra.
 */
const createDefaultAdapters: AdapterFactory = () =>
  hasNativeBridge() ? createAndroidAdapters() : createWebAdapters();

let adapterFactory: AdapterFactory = createDefaultAdapters;

export function setAdapterFactory(factory: AdapterFactory): void {
  adapterFactory = factory;
}

/**
 * Assinatura estável do estado dos controles.
 *
 * Usada para descartar os snapshots em que nada relevante mudou, evitando
 * um render por frame. Eixos são arredondados a 2 casas: variação menor que
 * isso não altera nada visível.
 */
function padSignature(pads: PadInfo[]): string {
  return pads
    .map((pad) => {
      const buttons = pad.state?.buttons
        ? Object.entries(pad.state.buttons)
            .filter(([, pressed]) => pressed)
            .map(([name]) => name)
            .sort()
            .join(',')
        : '';
      const axes = pad.state?.axes;
      const axisSignature = axes
        ? [axes.lx, axes.ly, axes.rx, axes.ry, axes.lt, axes.rt]
            .map((value) => value.toFixed(2))
            .join(',')
        : '';
      return `${pad.key}:${buttons}:${axisSignature}`;
    })
    .join('|');
}

// ─── Provider Component ───────────────────────────────────────────────────────

interface PlatformProviderProps {
  children: React.ReactNode;
}

export function PlatformProvider({ children }: PlatformProviderProps) {
  const adaptersRef = useRef<PlatformAdapters | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [perfSample, setPerfSample] = useState<PerfSample | null>(null);
  const [pads, setPads] = useState<PadInfo[]>([]);

  // Initialize adapters once
  if (!adaptersRef.current) {
    adaptersRef.current = adapterFactory();
  }

  const adapters = adaptersRef.current;

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Bateria precisa de preparo assíncrono no browser e no Android
      await adapters.battery.init?.();
      if (mounted) {
        setBattery(adapters.battery.readStatus());
      }

      // Start performance monitoring
      adapters.perf.start((sample) => {
        if (mounted) setPerfSample(sample);
      });

      // Start input polling.
      // O adaptador entrega estado a ~60 Hz. Sem este filtro, cada frame
      // re-renderizaria a árvore inteira mesmo com o controle parado — o
      // equivalente a 60 renders/s de graça. Só propagamos quando a assinatura
      // (botões + eixos relevantes) muda.
      let lastSignature = '';
      adapters.input.start((updatedPads: PadInfo[]) => {
        if (!mounted) return;
        const signature = padSignature(updatedPads);
        if (signature === lastSignature) return;
        lastSignature = signature;
        setPads(updatedPads);
      });

      if (mounted) setIsReady(true);
    };

    init();

    // Poll battery periodically (simpler than event listeners for cross-platform)
    const batteryTimer = setInterval(() => {
      if (mounted) setBattery(adapters.battery.readStatus());
    }, 15000);

    return () => {
      mounted = false;
      clearInterval(batteryTimer);
      adapters.perf.stop();
      adapters.input.stop();
    };
  }, [adapters]);

  const value = useMemo<PlatformContextValue>(
    () => ({ adapters, battery, perfSample, pads, isReady }),
    [adapters, battery, perfSample, pads, isReady],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlatform(): PlatformContextValue {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
}

// Convenience hooks for individual subsystems
export function useBattery(): BatteryStatus | null {
  return usePlatform().battery;
}

export function usePerf(): PerfSample | null {
  return usePlatform().perfSample;
}

export function usePads(): PadInfo[] {
  return usePlatform().pads;
}

export function useLauncher(): LauncherAdapter {
  return usePlatform().adapters.launcher;
}

export function useOptimize(): OptimizeAdapter {
  return usePlatform().adapters.optimize;
}

export function useProcess(): ProcessAdapter {
  return usePlatform().adapters.process;
}

export function useInput(): InputAdapter {
  return usePlatform().adapters.input;
}