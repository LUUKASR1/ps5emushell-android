package com.ps5emushell.plugin

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.io.File

/**
 * Performance sampling for Android.
 *
 * Replaces src/main/system/perf-monitor.js, which spawned PowerShell and used
 * Get-Counter for GPU/disk and tasklist.exe for the top-process list.
 *
 * Android equivalents used here:
 *   CPU      /proc/stat          (per-core jiffies, delta-based like the original)
 *   RAM      /proc/meminfo       (MemTotal - MemAvailable)
 *   GPU      Adreno sysfs        (/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage)
 *   Disk     /proc/diskstats     (sectors read/written -> % busy)
 *   Top apps ProcessReader       (VmRSS from /proc/<pid>/status)
 *
 * Every counter is optional: if a sysfs node is missing (non-Adreno GPU, older
 * kernel) the field is simply omitted and the UI renders "N/A", matching the
 * graceful-degradation behaviour of the original Windows build.
 */
class PerfMonitor(
    private val context: Context,
    private val onSample: (Sample) -> Unit,
) {

    data class CpuInfo(val total: Int, val per: List<Int>, val model: String)

    data class RamInfo(val total: Long, val used: Long)

    data class GpuInfo(
        val load: Int,
        val dedicated: Long? = null,
        val shared: Long? = null,
        val disk: Int? = null,
    )

    data class Sample(
        val cpu: CpuInfo,
        val ram: RamInfo,
        val gpu: GpuInfo?,
        val gpuName: String?,
        val top: List<ProcessReader.Entry>,
    ) {
        fun toJs(): JSObject = JSObject().apply {
            put("cpu", JSObject().apply {
                put("total", cpu.total)
                put("per", JSArray().also { arr -> cpu.per.forEach { arr.put(it) } })
                put("model", cpu.model)
            })
            put("ram", JSObject().put("total", ram.total).put("used", ram.used))
            gpu?.let { g ->
                put("gpu", JSObject().apply {
                    put("load", g.load)
                    g.dedicated?.let { put("dedicated", it) }
                    g.shared?.let { put("shared", it) }
                    g.disk?.let { put("disk", it) }
                })
            }
            gpuName?.let { put("gpuInfo", it) }
            put("top", JSArray().also { arr ->
                top.forEach { entry ->
                    arr.put(JSObject().apply {
                        put("name", entry.name)
                        put("image", entry.exe ?: entry.name)
                        put("count", 1)
                        put("memMB", entry.memKB / 1024)
                    })
                }
            })
        }
    }

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var previousCpu: List<CpuTick>? = null
    private var previousDisk: DiskTick? = null
    private val processReader = ProcessReader()

    private data class CpuTick(val idle: Long, val total: Long)
    private data class DiskTick(val sectors: Long, val millisAtSample: Long)

    private val tickRunnable = object : Runnable {
        override fun run() {
            runCatching { onSample(sample()) }
            handler?.postDelayed(this, intervalMs)
        }
    }

    private var intervalMs = 2000L

    fun start(interval: Long) {
        if (handler != null) return
        intervalMs = interval.coerceIn(500L, 10_000L)
        previousCpu = null
        previousDisk = null
        HandlerThread("shell-perf").also {
            it.start()
            thread = it
            handler = Handler(it.looper)
        }
        handler?.post(tickRunnable)
    }

    fun stop() {
        handler?.removeCallbacksAndMessages(null)
        handler = null
        thread?.quitSafely()
        thread = null
    }

    // ─── Sampling ─────────────────────────────────────────────────────────────

    private fun sample(): Sample {
        val cpu = sampleCpu()
        val ram = sampleRam()
        val gpu = sampleGpu()
        val top = processReader.topByMemory(6)
        return Sample(cpu, ram, gpu, gpuNameFor(), top)
    }

    private fun sampleCpu(): CpuInfo {
        val current = readCpuTicks()
        val previous = previousCpu
        previousCpu = current

        val per = if (previous == null || previous.size != current.size) {
            emptyList()
        } else {
            current.mapIndexed { index, now ->
                val before = previous[index]
                val totalDelta = now.total - before.total
                if (totalDelta <= 0L) 0
                else {
                    val idleDelta = now.idle - before.idle
                    ((1.0 - idleDelta.toDouble() / totalDelta) * 100.0)
                        .toInt().coerceIn(0, 100)
                }
            }
        }
        val total = if (per.isEmpty()) 0 else per.sum() / per.size
        return CpuInfo(total, per, cpuModel())
    }

    private fun readCpuTicks(): List<CpuTick> {
        val ticks = mutableListOf<CpuTick>()
        runCatching {
            File("/proc/stat").forEachLine { line ->
                if (!line.startsWith("cpu") || line.startsWith("cpu ")) return@forEachLine
                val parts = line.trim().split(Regex("\\s+"))
                if (parts.size < 5) return@forEachLine
                // user nice system idle iowait irq softirq steal
                val values = parts.drop(1).mapNotNull { it.toLongOrNull() }
                if (values.size < 4) return@forEachLine
                val idle = values[3] + (values.getOrNull(4) ?: 0L)
                val total = values.sum()
                ticks.add(CpuTick(idle, total))
            }
        }
        return ticks
    }

    private fun cpuModel(): String = runCatching {
        File("/proc/cpuinfo").useLines { lines ->
            lines.firstOrNull { it.startsWith("Hardware") }
                ?.substringAfter(':')?.trim()
                ?: lines.firstOrNull { it.startsWith("model name") }
                    ?.substringAfter(':')?.trim()
                ?: android.os.Build.HARDWARE
        }
    }.getOrDefault(android.os.Build.HARDWARE)

    private fun sampleRam(): RamInfo {
        var total = 0L
        var available = 0L
        runCatching {
            File("/proc/meminfo").forEachLine { line ->
                when {
                    line.startsWith("MemTotal:") ->
                        total = line.filter { it.isDigit() }.toLongOrNull() ?: 0L
                    line.startsWith("MemAvailable:") ->
                        available = line.filter { it.isDigit() }.toLongOrNull() ?: 0L
                }
            }
        }
        // meminfo is in kB
        val totalBytes = total * 1024
        val availBytes = available * 1024
        return RamInfo(totalBytes, (totalBytes - availBytes).coerceAtLeast(0))
    }

    private fun sampleGpu(): GpuInfo? {
        val busy = readLong(GPU_BUSY_PATHS.firstOrNull { File(it).exists() })
            ?: return null
        return GpuInfo(
            load = busy.toInt().coerceIn(0, 100),
            disk = sampleDiskBusy(),
        )
    }

    private fun gpuNameFor(): String? = when {
        File("/sys/class/kgsl").exists() -> "Adreno (${android.os.Build.SOC_MODEL})"
        File("/sys/class/mali").exists() -> "Mali (${android.os.Build.SOC_MODEL})"
        else -> null
    }

    private fun sampleDiskBusy(): Int? {
        val sectors = runCatching {
            File("/proc/diskstats").useLines { lines ->
                lines.filter { it.contains(" mmcblk0 ") || it.contains(" sda ") }
                    .sumOf { line ->
                        val p = line.trim().split(Regex("\\s+"))
                        val read = p.getOrNull(5)?.toLongOrNull() ?: 0L
                        val written = p.getOrNull(9)?.toLongOrNull() ?: 0L
                        read + written
                    }
            }
        }.getOrNull() ?: return null

        val previous = previousDisk
        val now = System.currentTimeMillis()
        previousDisk = DiskTick(sectors, now)
        if (previous == null) return 0

        val deltaSectors = sectors - previous.sectors
        val deltaMs = (now - previous.millisAtSample).coerceAtLeast(1)
        // 512 bytes/sector, and we only care about relative activity
        val bytesPerMs = deltaSectors * 512.0 / deltaMs
        // 100 MB/s is treated as saturation for a handheld eMMC/UFS
        return ((bytesPerMs / 102_400.0) * 100.0).toInt().coerceIn(0, 100)
    }

    private fun readLong(path: String?): Long? {
        if (path == null) return null
        return runCatching { File(path).readText().trim().toLongOrNull() }.getOrNull()
    }

    private companion object {
        val GPU_BUSY_PATHS = listOf(
            "/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage",
            "/sys/class/kgsl/kgsl-3d0/gpubusy",
            "/sys/class/misc/mali0/device/utilisation",
            "/sys/kernel/gpu/gpu_busy",
        )
    }
}
