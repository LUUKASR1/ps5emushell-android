package com.ps5emushell.plugin

import android.os.Build
import android.os.VibrationEffect
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Controller input for Android.
 *
 * Replaces src/main/input/xinput-reader.js, which polled XInputGetState on four
 * slots through koffi, plus the polling loop in controller-hub.js.
 *
 * Android has no polling API for gamepads — input arrives as events. The activity
 * therefore forwards dispatchKeyEvent / dispatchGenericMotionEvent here, and this
 * class maintains the same normalised state shape the original JS expected:
 *   { buttons: Set-like map, lx, ly, rx, ry, lt, rt }
 * JS then polls snapshot() at its own cadence, so controller-hub.js logic
 * (repeat timers, combos, player slots) ports over unchanged.
 *
 * Odin 2 Portal specifics handled here:
 *   - Hall-effect sticks report wider raw ranges -> normalised via the device's
 *     own min/max from getMotionRange, not a hardcoded 32767 like XInput.
 *   - The extra back buttons L4/R4 arrive as BUTTON_1..BUTTON_16, surfaced
 *     under separate names so they can be bound in settings.
 *   - Analog triggers on this device can report as either AXIS_LTRIGGER or as
 *     a button depending on firmware; both paths fill the same lt/rt value.
 */
class GamepadReader {

    private data class PadState(
        val deviceId: Int,
        val name: String,
        val buttons: MutableSet<String> = mutableSetOf(),
        var lx: Float = 0f,
        var ly: Float = 0f,
        var rx: Float = 0f,
        var ry: Float = 0f,
        var lt: Float = 0f,
        var rt: Float = 0f,
    )

    private val pads = mutableMapOf<Int, PadState>()

    // ─── Event entry points (called from MainActivity) ────────────────────────

    fun onKeyEvent(event: KeyEvent, isDown: Boolean): Boolean {
        val device = event.device ?: return false
        if (!isGamepad(device)) return false

        val pad = pads.getOrPut(device.deviceId) { newPad(device) }
        val button = mapKeyCode(event.keyCode) ?: return false

        if (isDown) pad.buttons.add(button) else pad.buttons.remove(button)

        // Analog triggers occasionally arrive as keys on some firmware
        when (event.keyCode) {
            KeyEvent.KEYCODE_BUTTON_L2 -> pad.lt = if (isDown) 1f else 0f
            KeyEvent.KEYCODE_BUTTON_R2 -> pad.rt = if (isDown) 1f else 0f
        }
        return true
    }

    fun onGenericMotionEvent(event: MotionEvent): Boolean {
        val device = event.device ?: return false
        if (!isGamepad(device)) return false
        if (event.source and InputDevice.SOURCE_JOYSTICK == 0 &&
            event.source and InputDevice.SOURCE_DPAD == 0
        ) return false

        val pad = pads.getOrPut(device.deviceId) { newPad(device) }

        pad.lx = normalise(device, event, MotionEvent.AXIS_X)
        pad.ly = -normalise(device, event, MotionEvent.AXIS_Y)
        pad.rx = normalise(device, event, MotionEvent.AXIS_Z)
        pad.ry = -normalise(device, event, MotionEvent.AXIS_RZ)

        val lt = triggerFraction(device, event, MotionEvent.AXIS_LTRIGGER)
        val rt = triggerFraction(device, event, MotionEvent.AXIS_RTRIGGER)
        if (lt > 0f) pad.lt = lt
        if (rt > 0f) pad.rt = rt

        // D-pad reported as a hat axis rather than keys
        val hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X)
        val hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
        setIf(pad, "left", hatX < -0.5f)
        setIf(pad, "right", hatX > 0.5f)
        setIf(pad, "up", hatY < -0.5f)
        setIf(pad, "down", hatY > 0.5f)

        return true
    }

    fun onDeviceAdded(device: InputDevice) {
        if (isGamepad(device)) pads.getOrPut(device.deviceId) { newPad(device) }
    }

    fun onDeviceRemoved(deviceId: Int) {
        pads.remove(deviceId)
    }

    // ─── Snapshot for JS ──────────────────────────────────────────────────────

    fun snapshot(): List<PadInfo> = pads.map { (deviceId, pad) ->
        PadInfo(
            key = "android:$deviceId",
            type = detectType(pad.name),
            name = pad.name,
            conn = "builtin",
            deviceId = deviceId,
            buttons = pad.buttons.toSet(),
            lx = pad.lx, ly = pad.ly, rx = pad.rx, ry = pad.ry,
            lt = pad.lt, rt = pad.rt,
        )
    }

    data class PadInfo(
        val key: String,
        val type: String,
        val name: String,
        val conn: String,
        val deviceId: Int,
        val buttons: Set<String>,
        val lx: Float, val ly: Float,
        val rx: Float, val ry: Float,
        val lt: Float, val rt: Float,
    ) {
        fun toJs(): JSObject = JSObject().apply {
            put("key", key)
            put("type", type)
            put("name", name)
            put("conn", conn)
            put("state", JSObject().apply {
                put("buttons", JSObject().also { b ->
                    buttons.forEach { b.put(it, true) }
                })
                put("axes", JSObject().apply {
                    put("lx", lx.toDouble())
                    put("ly", ly.toDouble())
                    put("rx", rx.toDouble())
                    put("ry", ry.toDouble())
                    put("lt", lt.toDouble())
                    put("rt", rt.toDouble())
                })
                put("connected", true)
            })
        }
    }

    // ─── Rumble ───────────────────────────────────────────────────────────────

    fun rumble(padIndex: Int, strong: Float, weak: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val device = InputDevice.getDeviceIds()
            .mapNotNull { InputDevice.getDevice(it) }
            .firstOrNull { isGamepad(it) } ?: return

        runCatching {
            val vibrator = device.vibrator ?: return
            val amplitude = ((strong.coerceIn(0f, 1f) * 255).toInt()).coerceIn(1, 255)
            vibrator.vibrate(
                VibrationEffect.createOneShot(120, amplitude)
            )
        }
    }

    fun trimToActiveOnly() {
        if (pads.size > 1) {
            val first = pads.keys.first()
            pads.keys.retainAll(setOf(first))
        }
    }

    fun release() = pads.clear()

    // ─── Mapping helpers ──────────────────────────────────────────────────────

    private fun newPad(device: InputDevice) = PadState(device.deviceId, device.name ?: "Controller")

    private fun isGamepad(device: InputDevice): Boolean {
        val sources = device.sources
        return sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
            sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
    }

    private fun detectType(name: String): String {
        val n = name.lowercase()
        return when {
            n.contains("xbox") || n.contains("odin") -> "xbox"
            n.contains("dualsense") || n.contains("ps5") -> "dualsense"
            n.contains("dualshock") || n.contains("ps4") -> "dualshock"
            n.contains("switch") || n.contains("nintendo") -> "nintendo"
            else -> "generic"
        }
    }

    private fun mapKeyCode(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_BUTTON_A -> "cross"
        KeyEvent.KEYCODE_BUTTON_B -> "circle"
        KeyEvent.KEYCODE_BUTTON_X -> "square"
        KeyEvent.KEYCODE_BUTTON_Y -> "triangle"
        KeyEvent.KEYCODE_BUTTON_L1 -> "l1"
        KeyEvent.KEYCODE_BUTTON_R1 -> "r1"
        KeyEvent.KEYCODE_BUTTON_L2 -> "l2"
        KeyEvent.KEYCODE_BUTTON_R2 -> "r2"
        KeyEvent.KEYCODE_BUTTON_THUMBL -> "l3"
        KeyEvent.KEYCODE_BUTTON_THUMBR -> "r3"
        KeyEvent.KEYCODE_BUTTON_START -> "options"
        KeyEvent.KEYCODE_BUTTON_SELECT -> "create"
        KeyEvent.KEYCODE_BUTTON_MODE -> "ps"
        KeyEvent.KEYCODE_DPAD_UP -> "up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
        // Odin 2 Portal extra back buttons
        KeyEvent.KEYCODE_BUTTON_1 -> "l4"
        KeyEvent.KEYCODE_BUTTON_2 -> "r4"
        KeyEvent.KEYCODE_BUTTON_3 -> "extra1"
        KeyEvent.KEYCODE_BUTTON_4 -> "extra2"
        else -> null
    }

    /**
     * Normalises an axis to -1..1 using the device's own reported range.
     * The original code divided by XINPUT_AXIS_MAX (32767) because XInput is
     * fixed-format; Android devices differ, and the Odin's hall sticks in
     * particular report a wider calibrated range.
     */
    private fun normalise(device: InputDevice, event: MotionEvent, axis: Int): Float {
        val range = device.getMotionRange(axis, event.source)
        val value = event.getAxisValue(axis)

        if (range == null || range.range == 0f) {
            return value.coerceIn(-1f, 1f)
        }
        val centre = (range.min + range.max) / 2f
        val half = range.range / 2f
        return ((value - centre) / half).coerceIn(-1f, 1f)
    }

    private fun triggerFraction(device: InputDevice, event: MotionEvent, axis: Int): Float {
        val range = device.getMotionRange(axis, event.source) ?: return 0f
        val value = event.getAxisValue(axis)
        if (range.range == 0f) return 0f
        return ((value - range.min) / range.range).coerceIn(0f, 1f)
    }

    private fun setIf(pad: PadState, button: String, pressed: Boolean) {
        if (pressed) pad.buttons.add(button) else pad.buttons.remove(button)
    }
}
