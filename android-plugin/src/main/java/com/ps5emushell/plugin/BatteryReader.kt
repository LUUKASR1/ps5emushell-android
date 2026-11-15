package com.ps5emushell.plugin

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

/**
 * Reads battery level and charging state.
 *
 * Replaces the original Windows implementation in src/main/system/battery.js,
 * which called kernel32!GetSystemPowerStatus through koffi.
 *
 * On Android the ACTION_BATTERY_CHANGED broadcast is sticky, so reading it via
 * registerReceiver(null, filter) returns the current state immediately without
 * keeping a receiver registered.
 */
class BatteryReader(private val context: Context) {

    data class Status(val level: Int, val charging: Boolean)

    fun read(): Status? {
        return try {
            val intent = context.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            ) ?: return null

            val rawLevel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (rawLevel < 0 || scale <= 0) return null

            val percent = (rawLevel * 100f / scale).toInt().coerceIn(0, 100)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

            Status(percent, charging)
        } catch (e: Exception) {
            null
        }
    }
}
