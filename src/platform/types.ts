/**
 * Platform Abstraction Layer — Type Contracts
 *
 * These interfaces define the contract that every platform adapter must fulfill.
 * Both Windows (original) and Android (port) implementations conform to these shapes.
 */

// ─── Battery ───────────────────────────────────────────────────────────────────

export interface BatteryStatus {
  level: number;   // 0–100
  charging: boolean;
}

export interface BatteryAdapter {
  /** Preparação assíncrona opcional (Battery API do browser / bridge nativa). */
  init?(): Promise<void>;
  readStatus(): BatteryStatus | null;
}

// ─── Performance Monitor ──────────────────────────────────────────────────────

export interface CpuSample {
  total: number;       // average usage % across all cores
  per: number[];       // per-core usage %
  model: string;
}

export interface RamSample {
  total: number;       // bytes
  used: number;        // bytes
}

export interface GpuSample {
  load: number;        // 0–100
  dedicated?: number;  // bytes (may be unavailable on Android)
  shared?: number;     // bytes
  disk?: number;       // 0–100 disk utilization
}

export interface TopProcess {
  name: string;
  image: string;
  count: number;
  memMB: number;
}

export interface PerfSample {
  cpu: CpuSample;
  ram: RamSample;
  gpu: GpuSample | null;
  gpuInfo?: string;
  top: TopProcess[];
}

export interface PerfAdapter {
  start(onSample: (sample: PerfSample) => void): void;
  stop(): void;
}

// ─── Process Management ───────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  exe: string | null;
  name?: string;
  memKB?: number;
}

export interface ProcessAdapter {
  listRunning(): ProcessInfo[];
  listInFolder(folder: string): ProcessInfo[];
  isPathInside(filePath: string, folder: string): boolean;
}

// ─── Controller Input ─────────────────────────────────────────────────────────

export type ButtonState = Record<string, boolean>;

export interface AxisState {
  lx: number; ly: number;   // left stick  -1..1
  rx: number; ry: number;   // right stick -1..1
  lt: number; rt: number;   // triggers    0..1
}

export interface PadState {
  buttons: ButtonState;
  axes: AxisState;
  connected: boolean;
}

export interface PadInfo {
  key: string;
  type: string;
  name: string;
  conn: 'usb' | 'bt' | 'builtin';
  state: PadState | null;
}

export interface RumbleCommand {
  player?: number;
  strong?: number;   // 0–1
  weak?: number;     // 0–1
}

export interface InputAdapter {
  readonly isAvailable: boolean;
  readonly error: string | null;
  /** Inicia o polling; `onChange` recebe o snapshot a cada alteração. */
  start(onChange?: (pads: PadInfo[]) => void): void;
  stop(): void;
  listPads(): PadInfo[];
  sendOutput(key: string, cmd: RumbleCommand): void;
}

// ─── Game / Emulator Launcher ─────────────────────────────────────────────────

export interface LaunchResult {
  ok: boolean;
  error?: string;
  emulator?: string;
  emulatorName?: string;
}

export interface ExitInfo {
  game: { title: string; path: string; system?: string; native?: boolean };
  emulator: string;
  code: number | null;
  duration: number;   // ms
  error: string | null;
}

export interface LauncherAdapter {
  startGame(params: {
    game: { title: string; path: string; system?: string; native?: boolean; base?: string };
    emulatorOverride?: string;
    onExit: (info: ExitInfo) => void;
  }): LaunchResult;
  killGame(): boolean;
  isGameRunning(): boolean;
  findRunningProcessId(): number | null;
}

// ─── System Optimization ──────────────────────────────────────────────────────

export interface OptimizationResult {
  closed: number;
  trimmed: number;
  freedMB: number;
}

export interface OptimizeAdapter {
  preview(killList: string[]): TopProcess[];
  run(processNames: string[], options?: { trim?: boolean; protectPids?: number[] }): Promise<OptimizationResult>;
}

// ─── Aggregate Platform Interface ─────────────────────────────────────────────

export interface PlatformAdapters {
  battery: BatteryAdapter;
  perf: PerfAdapter;
  process: ProcessAdapter;
  input: InputAdapter;
  launcher: LauncherAdapter;
  optimize: OptimizeAdapter;
}