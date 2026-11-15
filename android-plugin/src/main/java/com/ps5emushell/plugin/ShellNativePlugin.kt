package com.ps5emushell.plugin

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ShellNative — Capacitor bridge for the Android port of PS5 Emu Shell.
 *
 * Replaces the seven Windows-only subsystems used by the original Electron
 * main process:
 *
 *   koffi -> xinput1_4.dll          -> Android InputDevice / KeyEvent
 *   node-hid -> DualSense reports   -> (delegated to Web Gamepad API, see notes)
 *   kernel32 EnumProcesses          -> /proc filesystem
 *   PowerShell Get-Counter          -> /proc + Adreno sysfs nodes
 *   kernel32 GetSystemPowerStatus   -> BatteryManager
 *   child_process.spawn + taskkill  -> PackageManager intents
 *   K32EmptyWorkingSet              -> no-op (Android LMK owns this)
 */
@CapacitorPlugin(name = "ShellNative")
class ShellNativePlugin : Plugin() {

    private var battery: BatteryReader? = null
    private var perf: PerfMonitor? = null
    private var processes: ProcessReader? = null
    private var launcher: EmulatorLauncher? = null
    private var gamepad: GamepadReader? = null
    private var fileSystem: FileSystemReader? = null

    override fun load() {
        val ctx = context
        battery = BatteryReader(ctx)
        perf = PerfMonitor(ctx) { sample -> notifyListeners("perfSample", sample.toJs()) }
        processes = ProcessReader()
        launcher = EmulatorLauncher(ctx)
        gamepad = GamepadReader()
        fileSystem = FileSystemReader()
        Log.i(TAG, "ShellNative plugin loaded")
    }

    override fun handleOnDestroy() {
        perf?.stop()
        gamepad?.release()
    }

    /** MainActivity usa isto para encaminhar dispatchKeyEvent/dispatchGenericMotionEvent. */
    fun gamepadReader(): GamepadReader? = gamepad

    // ─── Battery ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun batteryGetStatus(call: PluginCall) {
        val status = battery?.read()
        if (status == null) {
            call.resolve(JSObject().put("level", -1).put("charging", false))
            return
        }
        call.resolve(JSObject().put("level", status.level).put("charging", status.charging))
    }

    // ─── Performance ──────────────────────────────────────────────────────────

    @PluginMethod
    fun perfStartMonitoring(call: PluginCall) {
        val interval = call.getInt("intervalMs") ?: 2000
        perf?.start(interval.toLong())
        call.resolve()
    }

    @PluginMethod
    fun perfStopMonitoring(call: PluginCall) {
        perf?.stop()
        call.resolve()
    }

    // ─── Processes ────────────────────────────────────────────────────────────

    @PluginMethod
    fun processListRunning(call: PluginCall) {
        val list = JSArray()
        processes?.listRunning()?.forEach { list.put(it.toJs()) }
        call.resolve(JSObject().put("processes", list))
    }

    @PluginMethod
    fun processListInFolder(call: PluginCall) {
        val folder = call.getString("folder") ?: run {
            call.reject("folder is required")
            return
        }
        val list = JSArray()
        processes?.listInFolder(folder)?.forEach { list.put(it.toJs()) }
        call.resolve(JSObject().put("processes", list))
    }

    // ─── Input ────────────────────────────────────────────────────────────────

    @PluginMethod
    fun inputGetPads(call: PluginCall) {
        val pads = JSArray()
        gamepad?.snapshot()?.forEach { pads.put(it.toJs()) }
        call.resolve(JSObject().put("pads", pads))
    }

    @PluginMethod
    fun inputSendRumble(call: PluginCall) {
        val padIndex = call.getInt("padIndex") ?: 0
        val strong = call.getFloat("strong") ?: 0f
        val weak = call.getFloat("weak") ?: 0f
        gamepad?.rumble(padIndex, strong, weak)
        call.resolve()
    }

    // ─── Launcher ─────────────────────────────────────────────────────────────

    @PluginMethod
    fun launcherLaunch(call: PluginCall) {
        val emuId = call.getString("emuId") ?: run {
            call.reject("emuId is required")
            return
        }
        val gamePath = call.getString("gamePath") ?: run {
            call.reject("gamePath is required")
            return
        }
        val result = launcher?.launch(emuId, gamePath)
            ?: EmulatorLauncher.LaunchOutcome(false, "launcher unavailable", null)

        if (!result.ok) {
            call.reject(result.error ?: "launch failed")
            return
        }
        call.resolve(
            JSObject()
                .put("ok", true)
                .put("packageName", result.packageName)
        )
    }

    @PluginMethod
    fun launcherIsRunning(call: PluginCall) {
        val packageName = call.getString("packageName") ?: run {
            call.reject("packageName is required")
            return
        }
        call.resolve(JSObject().put("running", launcher?.isRunning(packageName) ?: false))
    }

    @PluginMethod
    fun launcherExit(call: PluginCall) {
        val packageName = call.getString("packageName") ?: run {
            call.reject("packageName is required")
            return
        }
        call.resolve(JSObject().put("ok", launcher?.exit(packageName) ?: false))
    }

    // ─── Sistema de arquivos (scanner de ROMs) ────────────────────────────────

    @PluginMethod
    fun fsListDir(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.reject("path is required")
            return
        }
        val entries = fileSystem?.listDir(path) ?: emptyList()
        call.resolve(JSObject().put("entries", fileSystem?.entriesToJs(entries) ?: JSArray()))
    }

    @PluginMethod
    fun fsStat(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.reject("path is required")
            return
        }
        val stat = fileSystem?.stat(path)
        if (stat == null) {
            call.resolve(JSObject().put("exists", false))
            return
        }
        call.resolve(
            stat.toJs().put("exists", true)
        )
    }

    @PluginMethod
    fun fsReadText(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.reject("path is required")
            return
        }
        val content = fileSystem?.readText(path)
        call.resolve(JSObject().put("content", content))
    }

    @PluginMethod
    fun fsWriteText(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.reject("path is required")
            return
        }
        val content = call.getString("content") ?: ""
        val ok = fileSystem?.writeText(path, content) ?: false
        call.resolve(JSObject().put("ok", ok))
    }

    /**
     * Caminho da área privada do app, onde ficam config/stats/library.
     * No Android isso é `context.filesDir`, equivalente ao `launcher/data`
     * do launcher de PC.
     */
    @PluginMethod
    fun appGetPaths(call: PluginCall) {
        val filesDir = context.filesDir.absolutePath
        call.resolve(
            JSObject()
                .put("dataDir", "$filesDir/data")
                .put("filesDir", filesDir)
                .put("cacheDir", context.cacheDir.absolutePath)
        )
    }

    // ─── Optimize ─────────────────────────────────────────────────────────────

    /**
     * Android's low-memory killer already reclaims background memory, and
     * force-stopping arbitrary packages is not permitted for third-party apps.
     * This is deliberately a near no-op that only clears our own caches, so
     * the settings UI stays functional without pretending to do something.
     */
    @PluginMethod
    fun optimizeApplyProfile(call: PluginCall) {
        gamepad?.trimToActiveOnly()
        System.gc()
        call.resolve(
            JSObject()
                .put("closed", 0)
                .put("trimmed", 0)
                .put("freedMB", 0)
                .put("supported", false)
        )
    }

    @PluginMethod
    fun optimizeReset(call: PluginCall) {
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun optimizeGetProfile(call: PluginCall) {
        call.resolve(JSObject().put("profile", "android-default"))
    }

    private companion object {
        const val TAG = "ShellNative"
    }
}
