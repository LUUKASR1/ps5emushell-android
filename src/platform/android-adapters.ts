/**
 * Android Nativo — adaptadores sobre o plugin Capacitor `ShellNative`.
 *
 * Cada classe aqui é o espelho em TypeScript de um arquivo Kotlin em
 * `android-plugin/`. O mapeamento é:
 *
 *   AndroidBatteryAdapter  <->  BatteryReader.kt
 *   AndroidPerfAdapter     <->  PerfMonitor.kt
 *   AndroidProcessAdapter  <->  ProcessReader.kt
 *   AndroidInputAdapter    <->  GamepadReader.kt
 *   AndroidLauncherAdapter <->  EmulatorLauncher.kt
 *   AndroidOptimizeAdapter <->  ShellNativePlugin.kt (no-op intencional)
 *
 * Os adaptadores degradam com elegância quando o plugin não existe (build web),
 * para que o mesmo bundle rode no navegador durante o desenvolvimento.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import type {
  BatteryAdapter,
  BatteryStatus,
  PerfAdapter,
  PerfSample,
  ProcessAdapter,
  ProcessInfo,
  InputAdapter,
  PadInfo,
  RumbleCommand,
  LauncherAdapter,
  LaunchResult,
  ExitInfo,
  OptimizeAdapter,
  OptimizationResult,
  TopProcess,
} from './types';

// ─── Contrato do plugin nativo ────────────────────────────────────────────────

interface ShellNativePlugin {
  batteryGetStatus(): Promise<{ level: number; charging: boolean }>;

  perfStartMonitoring(options: { intervalMs: number }): Promise<void>;
  perfStopMonitoring(): Promise<void>;
  addListener(
    eventName: 'perfSample',
    listener: (sample: PerfSample) => void,
  ): Promise<{ remove: () => Promise<void> }>;

  processListRunning(): Promise<{ processes: ProcessInfo[] }>;
  processListInFolder(options: { folder: string }): Promise<{ processes: ProcessInfo[] }>;

  inputGetPads(): Promise<{ pads: PadInfo[] }>;
  inputSendRumble(options: {
    padIndex: number;
    strong: number;
    weak: number;
  }): Promise<void>;

  launcherLaunch(options: {
    emuId: string;
    gamePath: string;
  }): Promise<{ ok: boolean; packageName: string | null }>;
  launcherIsRunning(options: { packageName: string }): Promise<{ running: boolean }>;
  launcherExit(options: { packageName: string }): Promise<{ ok: boolean }>;

  optimizeApplyProfile(options: { profile: string }): Promise<OptimizationResult>;
  optimizeReset(): Promise<{ ok: boolean }>;
  optimizeGetProfile(): Promise<{ profile: string }>;

  // Sistema de arquivos — usado pelo scanner de ROMs
  fsListDir(options: {
    path: string;
  }): Promise<{ entries: { name: string; isDirectory: boolean }[] }>;
  fsStat(options: {
    path: string;
  }): Promise<{
    exists: boolean;
    size?: number;
    birthtimeMs?: number;
    mtimeMs?: number;
  }>;
  fsReadText(options: { path: string }): Promise<{ content: string | null }>;
  fsWriteText(options: { path: string; content: string }): Promise<{ ok: boolean }>;

  /** Área privada do app: config, stats e biblioteca ficam aqui. */
  appGetPaths(): Promise<{ dataDir: string; filesDir: string; cacheDir: string }>;
}

export const ShellNative = registerPlugin<ShellNativePlugin>('ShellNative');

/** True quando estamos rodando no app Android com o plugin registrado. */
export function hasNativeBridge(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('ShellNative');
}

function unavailableReason(feature: string): string {
  return `ShellNative.${feature} indisponível (fora do Android ou plugin não registrado)`;
}

// ─── Bateria ──────────────────────────────────────────────────────────────────

export class AndroidBatteryAdapter implements BatteryAdapter {
  private cached: BatteryStatus | null = null;
  private lastReadAt = 0;
  private readonly cacheTtlMs = 5000;
  private inFlight = false;

  async init(): Promise<void> {
    if (!hasNativeBridge()) return;
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const status = await ShellNative.batteryGetStatus();
      this.cached =
        status.level < 0 ? null : { level: status.level, charging: status.charging };
      this.lastReadAt = Date.now();
    } catch {
      // mantém o último valor conhecido
    } finally {
      this.inFlight = false;
    }
  }

  readStatus(): BatteryStatus | null {
    if (hasNativeBridge() && Date.now() - this.lastReadAt > this.cacheTtlMs) {
      void this.refresh();
    }
    return this.cached;
  }
}

// ─── Desempenho ───────────────────────────────────────────────────────────────

export class AndroidPerfAdapter implements PerfAdapter {
  private listener: { remove: () => Promise<void> } | null = null;
  private running = false;

  start(onSample: (sample: PerfSample) => void): void {
    if (this.running) return;
    if (!hasNativeBridge()) {
      console.warn(`[perf] ${unavailableReason('perf')}`);
      return;
    }
    this.running = true;

    void ShellNative.addListener('perfSample', onSample).then((handle) => {
      this.listener = handle;
    });

    void ShellNative.perfStartMonitoring({ intervalMs: 2000 }).catch((err) => {
      console.warn('[perf] falha ao iniciar monitoramento', err);
      this.running = false;
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    void this.listener?.remove();
    this.listener = null;
    void ShellNative.perfStopMonitoring().catch(() => undefined);
  }
}

// ─── Processos ────────────────────────────────────────────────────────────────

export class AndroidProcessAdapter implements ProcessAdapter {
  /**
   * A API nativa é assíncrona, mas a interface herdada do original é síncrona.
   * Esses métodos existem para compatibilidade de tipo e devolvem vazio;
   * use as variantes `*Async` na UI.
   */
  listRunning(): ProcessInfo[] {
    return [];
  }

  listInFolder(_folder: string): ProcessInfo[] {
    return [];
  }

  isPathInside(filePath: string, folder: string): boolean {
    const file = filePath.replace(/\/+$/, '');
    const root = folder.replace(/\/+$/, '');
    return file === root || file.startsWith(`${root}/`);
  }

  async listRunningAsync(): Promise<ProcessInfo[]> {
    if (!hasNativeBridge()) return [];
    try {
      return (await ShellNative.processListRunning()).processes;
    } catch {
      return [];
    }
  }

  async listInFolderAsync(folder: string): Promise<ProcessInfo[]> {
    if (!hasNativeBridge()) return [];
    try {
      return (await ShellNative.processListInFolder({ folder })).processes;
    } catch {
      return [];
    }
  }
}

// ─── Controles ────────────────────────────────────────────────────────────────

export class AndroidInputAdapter implements InputAdapter {
  readonly isAvailable = hasNativeBridge();
  readonly error: string | null = hasNativeBridge()
    ? null
    : unavailableReason('input');

  private timer: ReturnType<typeof setInterval> | null = null;
  private onPads: ((pads: PadInfo[]) => void) | null = null;
  private polling = false;

  start(onChange?: (pads: PadInfo[]) => void): void {
    if (this.timer) return;
    if (!hasNativeBridge()) return;
    this.onPads = onChange ?? null;

    // ~60 Hz, igual ao CONTROLLER_POLL_MS do controller-hub original.
    this.timer = setInterval(() => void this.poll(), 16);
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.onPads) return;
    this.polling = true;
    try {
      const { pads } = await ShellNative.inputGetPads();
      this.onPads(pads);
    } catch {
      // frame perdido — segue o jogo
    } finally {
      this.polling = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onPads = null;
  }

  listPads(): PadInfo[] {
    return [];
  }

  sendOutput(key: string, cmd: RumbleCommand): void {
    if (!hasNativeBridge()) return;
    const padIndex = Number(key.split(':')[1] ?? 0);
    void ShellNative.inputSendRumble({
      padIndex,
      strong: cmd.strong ?? 0,
      weak: cmd.weak ?? 0,
    }).catch(() => undefined);
  }
}

// ─── Lançador ─────────────────────────────────────────────────────────────────

export class AndroidLauncherAdapter implements LauncherAdapter {
  private runningPackage: string | null = null;
  private startedAt = 0;
  private onExitCb: ((info: ExitInfo) => void) | null = null;
  private currentGame: {
    title: string;
    path: string;
    system?: string;
    native?: boolean;
  } | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  startGame(params: {
    game: { title: string; path: string; system?: string; native?: boolean; base?: string };
    emulatorOverride?: string;
    onExit: (info: ExitInfo) => void;
  }): LaunchResult {
    if (this.runningPackage) {
      return { ok: false, error: 'Já existe um jogo em execução' };
    }
    if (!hasNativeBridge()) {
      return { ok: false, error: unavailableReason('launcher') };
    }

    const emuId = params.emulatorOverride ?? params.game.system;
    if (!emuId) {
      return { ok: false, error: 'Nenhum emulador definido para este jogo' };
    }

    this.currentGame = params.game;
    this.onExitCb = params.onExit;

    // A chamada nativa é assíncrona; o contrato herdado é síncrono, então
    // dispara em background e assume "ok" imediato — o watcher corrige o
    // estado real na primeira verificação (1 s depois).
    void ShellNative.launcherLaunch({ emuId, gamePath: params.game.path })
      .then((result) => {
        if (!result.ok || !result.packageName) {
          this.finish(0, 'Falha ao iniciar o emulador', 0);
          return;
        }
        this.runningPackage = result.packageName;
        this.startedAt = Date.now();
        this.watch();
      })
      .catch((err: unknown) => {
        this.finish(0, String(err), 0);
      });

    return { ok: true, emulator: emuId, emulatorName: emuId };
  }

  private watch(): void {
    this.clearWatch();
    this.watchTimer = setInterval(() => void this.check(), 1000);
  }

  private async check(): Promise<void> {
    if (!this.runningPackage) return;
    try {
      const { running } = await ShellNative.launcherIsRunning({
        packageName: this.runningPackage,
      });
      if (!running) {
        this.finish(0, null, Date.now() - this.startedAt);
      }
    } catch {
      // mantém a sessão; tenta de novo no próximo tick
    }
  }

  private finish(code: number | null, error: string | null, duration: number): void {
    this.clearWatch();
    const game = this.currentGame;
    const cb = this.onExitCb;
    this.runningPackage = null;
    this.currentGame = null;
    this.onExitCb = null;

    if (game && cb) {
      cb({ game, emulator: 'android', code, duration, error });
    }
  }

  private clearWatch(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
  }

  killGame(): boolean {
    if (!this.runningPackage) return false;
    void ShellNative.launcherExit({ packageName: this.runningPackage }).catch(
      () => undefined,
    );
    this.finish(0, null, Date.now() - this.startedAt);
    return true;
  }

  isGameRunning(): boolean {
    return this.runningPackage !== null;
  }

  findRunningProcessId(): number | null {
    return null; // Android não expõe PID de terceiros (ver ProcessReader.kt)
  }
}

// ─── Otimização ───────────────────────────────────────────────────────────────

/**
 * No Android esta funcionalidade não tem equivalente real: o low-memory killer
 * já reclama memória e o sistema proíbe encerrar outros pacotes. Mantido como
 * no-op explícito para que a tela de Configurações continue coerente.
 */
export class AndroidOptimizeAdapter implements OptimizeAdapter {
  preview(_killList: string[]): TopProcess[] {
    return [];
  }

  async run(
    _processNames: string[],
    _options?: { trim?: boolean; protectPids?: number[] },
  ): Promise<OptimizationResult> {
    if (!hasNativeBridge()) {
      return { closed: 0, trimmed: 0, freedMB: 0 };
    }
    try {
      return await ShellNative.optimizeApplyProfile({ profile: 'android-default' });
    } catch {
      return { closed: 0, trimmed: 0, freedMB: 0 };
    }
  }
}

// ─── Fábrica ──────────────────────────────────────────────────────────────────

export function createAndroidAdapters() {
  return {
    battery: new AndroidBatteryAdapter(),
    perf: new AndroidPerfAdapter(),
    process: new AndroidProcessAdapter(),
    input: new AndroidInputAdapter(),
    launcher: new AndroidLauncherAdapter(),
    optimize: new AndroidOptimizeAdapter(),
  };
}
