/**
 * Platform Abstraction Layer — Public API
 *
 * Re-exports all types, adapters, and the React context provider.
 * Import from this module rather than individual files.
 */

// Type contracts
export type {
  BatteryStatus,
  BatteryAdapter,
  CpuSample,
  RamSample,
  GpuSample,
  TopProcess,
  PerfSample,
  PerfAdapter,
  ProcessInfo,
  ProcessAdapter,
  ButtonState,
  AxisState,
  PadState,
  PadInfo,
  RumbleCommand,
  InputAdapter,
  LaunchResult,
  ExitInfo,
  LauncherAdapter,
  OptimizationResult,
  OptimizeAdapter,
  PlatformAdapters,
} from './types';

// Web fallback adapters (for browser development)
export {
  WebBatteryAdapter,
  WebPerfAdapter,
  WebProcessAdapter,
  WebInputAdapter,
  WebLauncherAdapter,
  WebOptimizeAdapter,
} from './web-adapters';

// Android native adapters (plugin Capacitor ShellNative)
export {
  AndroidBatteryAdapter,
  AndroidPerfAdapter,
  AndroidProcessAdapter,
  AndroidInputAdapter,
  AndroidLauncherAdapter,
  AndroidOptimizeAdapter,
  createAndroidAdapters,
  hasNativeBridge,
  ShellNative,
} from './android-adapters';

// React context and hooks
export {
  PlatformProvider,
  usePlatform,
  useBattery,
  usePerf,
  usePads,
  useLauncher,
  useOptimize,
  useProcess,
  useInput,
  setAdapterFactory,
} from './PlatformProvider';
export type { PlatformContextValue } from './PlatformProvider';