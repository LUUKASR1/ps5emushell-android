/**
 * Web Fallback Adapters
 *
 * These adapters provide stub/mock implementations for browser-based development.
 * They conform to the same interfaces as the Android adapters, allowing the UI
 * to be developed and tested without a physical device or emulator.
 */

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

// ─── Battery (Web Battery API) ────────────────────────────────────────────────

export class WebBatteryAdapter implements BatteryAdapter {
  private status: BatteryStatus | null = null;
  private battery: any = null;

  async init(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        this.battery = await (navigator as any).getBattery();
        this.updateStatus();
        this.battery.addEventListener('levelchange', () => this.updateStatus());
        this.battery.addEventListener('chargingchange', () => this.updateStatus());
      } catch {
        // Battery API not available or blocked
      }
    }
  }

  private updateStatus(): void {
    if (!this.battery) return;
    this.status = {
      level: Math.round(this.battery.level * 100),
      charging: this.battery.charging,
    };
  }

  readStatus(): BatteryStatus | null {
    return this.status;
  }
}

// ─── Performance Monitor (Simulated) ─────────────────────────────────────────

export class WebPerfAdapter implements PerfAdapter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private onSample: ((sample: PerfSample) => void) | null = null;

  start(onSample: (sample: PerfSample) => void): void {
    this.onSample = onSample;
    // Simulate performance samples every 2 seconds
    this.timer = setInterval(() => {
      const sample: PerfSample = {
        cpu: {
          total: Math.round(Math.random() * 30 + 10),
          per: Array.from({ length: 8 }, () => Math.round(Math.random() * 40 + 5)),
          model: 'Web Browser (Simulated)',
        },
        ram: {
          total: 8 * 1024 * 1024 * 1024,
          used: Math.round((Math.random() * 0.4 + 0.3) * 8 * 1024 * 1024 * 1024),
        },
        gpu: null,
        top: [],
      };
      this.onSample?.(sample);
    }, 2000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onSample = null;
  }
}

// ─── Process Management (Stub) ───────────────────────────────────────────────

export class WebProcessAdapter implements ProcessAdapter {
  listRunning(): ProcessInfo[] {
    // Browsers cannot enumerate system processes
    return [];
  }

  listInFolder(_folder: string): ProcessInfo[] {
    return [];
  }

  isPathInside(_filePath: string, _folder: string): boolean {
    return false;
  }
}

// ─── Controller Input (Gamepad API) ──────────────────────────────────────────

export class WebInputAdapter implements InputAdapter {
  readonly isAvailable = true;
  readonly error: string | null = null;

  private pads: Map<string, PadInfo> = new Map();
  private animationFrame: number | null = null;
  private onStateChange: ((pads: PadInfo[]) => void) | null = null;

  start(onStateChange?: (pads: PadInfo[]) => void): void {
    this.onStateChange = onStateChange ?? null;
    window.addEventListener('gamepadconnected', this.handleConnect);
    window.addEventListener('gamepaddisconnected', this.handleDisconnect);
    this.poll();
  }

  stop(): void {
    window.removeEventListener('gamepadconnected', this.handleConnect);
    window.removeEventListener('gamepaddisconnected', this.handleDisconnect);
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private handleConnect = (event: GamepadEvent): void => {
    const gp = event.gamepad;
    const key = `gamepad:${gp.index}`;
    this.pads.set(key, {
      key,
      type: this.detectType(gp),
      name: gp.id,
      conn: 'usb',
      state: null,
    });
    this.notifyChange();
  };

  private handleDisconnect = (event: GamepadEvent): void => {
    const key = `gamepad:${event.gamepad.index}`;
    this.pads.delete(key);
    this.notifyChange();
  };

  private detectType(gp: Gamepad): string {
    const id = gp.id.toLowerCase();
    if (id.includes('xbox') || id.includes('xinput')) return 'xbox';
    if (id.includes('playstation') || id.includes('dualsense') || id.includes('ds4')) return 'playstation';
    if (id.includes('nintendo') || id.includes('pro controller')) return 'nintendo';
    return 'generic';
  }

  private poll = (): void => {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;
      const key = `gamepad:${gp.index}`;
      const pad = this.pads.get(key);
      if (!pad) continue;

      // Map standard gamepad buttons
      const buttons: Record<string, boolean> = {
        A: gp.buttons[0]?.pressed ?? false,
        B: gp.buttons[1]?.pressed ?? false,
        X: gp.buttons[2]?.pressed ?? false,
        Y: gp.buttons[3]?.pressed ?? false,
        LB: gp.buttons[4]?.pressed ?? false,
        RB: gp.buttons[5]?.pressed ?? false,
        LT: gp.buttons[6]?.pressed ?? false,
        RT: gp.buttons[7]?.pressed ?? false,
        Back: gp.buttons[8]?.pressed ?? false,
        Start: gp.buttons[9]?.pressed ?? false,
        LS: gp.buttons[10]?.pressed ?? false,
        RS: gp.buttons[11]?.pressed ?? false,
        Up: gp.buttons[12]?.pressed ?? false,
        Down: gp.buttons[13]?.pressed ?? false,
        Left: gp.buttons[14]?.pressed ?? false,
        Right: gp.buttons[15]?.pressed ?? false,
        Home: gp.buttons[16]?.pressed ?? false,
      };

      pad.state = {
        buttons,
        axes: {
          lx: gp.axes[0] ?? 0,
          ly: gp.axes[1] ?? 0,
          rx: gp.axes[2] ?? 0,
          ry: gp.axes[3] ?? 0,
          lt: gp.buttons[6]?.value ?? 0,
          rt: gp.buttons[7]?.value ?? 0,
        },
        connected: gp.connected,
      };
    }
    this.notifyChange();
    this.animationFrame = requestAnimationFrame(this.poll);
  };

  private notifyChange(): void {
    this.onStateChange?.(this.listPads());
  }

  listPads(): PadInfo[] {
    return Array.from(this.pads.values());
  }

  sendOutput(_key: string, _cmd: RumbleCommand): void {
    // Gamepad haptics require user gesture and are not universally supported
    // Implementation would use gamepad.vibrationActuator.playEffect() where available
  }
}

// ─── Launcher (Stub — requires native bridge) ────────────────────────────────

export class WebLauncherAdapter implements LauncherAdapter {
  private running = false;
  private startedAt = 0;
  private currentGame: { title: string; path: string; system?: string; native?: boolean } | null = null;
  private onExitCallback: ((info: ExitInfo) => void) | null = null;

  startGame(params: {
    game: { title: string; path: string; system?: string; native?: boolean; base?: string };
    emulatorOverride?: string;
    onExit: (info: ExitInfo) => void;
  }): LaunchResult {
    if (this.running) {
      return { ok: false, error: 'A game is already running' };
    }

    // In web mode, we simulate a launch for UI testing
    console.warn('[WebLauncher] Simulating game launch — native bridge required for real emulation');
    this.running = true;
    this.startedAt = Date.now();
    this.currentGame = params.game;
    this.onExitCallback = params.onExit;

    return {
      ok: true,
      emulator: params.emulatorOverride ?? 'web-stub',
      emulatorName: 'Web Stub Emulator',
    };
  }

  killGame(): boolean {
    if (!this.running || !this.currentGame) return false;
    const duration = Date.now() - this.startedAt;
    this.running = false;
    this.onExitCallback?.({
      game: this.currentGame,
      emulator: 'web-stub',
      code: 0,
      duration,
      error: null,
    });
    this.currentGame = null;
    this.onExitCallback = null;
    return true;
  }

  isGameRunning(): boolean {
    return this.running;
  }

  findRunningProcessId(): number | null {
    return this.running ? -1 : null;
  }
}

// ─── System Optimization (Stub) ──────────────────────────────────────────────

export class WebOptimizeAdapter implements OptimizeAdapter {
  preview(_killList: string[]): TopProcess[] {
    // Cannot enumerate processes in browser
    return [];
  }

  async run(_processNames: string[], _options?: { trim?: boolean; protectPids?: number[] }): Promise<OptimizationResult> {
    // No-op in browser
    return { closed: 0, trimmed: 0, freedMB: 0 };
  }
}