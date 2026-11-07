package expo.modules.obdbluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/**
 * Bluetooth Classic serial transport for ELM327 adapters.
 *
 * Written against the Expo Modules API rather than using an off-the-shelf
 * library, because the available ones are built on React Native's old bridge:
 * they guard event delivery with hasActiveCatalystInstance, call
 * getJSModule().emit() without the null check the bridgeless runtime needs,
 * and register broadcast receivers without the export flag Android 14 requires.
 * Any one of those ends the process rather than returning an error.
 *
 * Everything here is deliberately defensive. Every entry point reports a coded
 * error instead of throwing into native code, and the read loop catches
 * Throwable — a background thread that throws takes the whole app down with it,
 * which is the failure this module exists to avoid.
 */

private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class BluetoothUnavailableException(message: String) :
  CodedException("ERR_BLUETOOTH_UNAVAILABLE", message, null)

class BluetoothPermissionException :
  CodedException(
    "ERR_BLUETOOTH_PERMISSION",
    "The Nearby devices permission has not been granted.",
    null,
  )

class BluetoothConnectException(message: String) :
  CodedException("ERR_BLUETOOTH_CONNECT", message, null)

class ObdBluetoothModule : Module() {
  private var socket: BluetoothSocket? = null
  private var output: OutputStream? = null
  private var readThread: Thread? = null

  @Volatile private var running = false

  override fun definition() = ModuleDefinition {
    Name("ObdBluetooth")

    Events("onData", "onClose")

    Function("isSupported") {
      adapterOrNull() != null
    }

    Function("isEnabled") {
      try {
        adapterOrNull()?.isEnabled == true
      } catch (_: SecurityException) {
        false
      }
    }

    Function("hasPermission") {
      hasConnectPermission()
    }

    AsyncFunction("listPaired") {
      val adapter = adapterOrNull()
        ?: throw BluetoothUnavailableException("This device has no Bluetooth adapter.")
      if (!hasConnectPermission()) throw BluetoothPermissionException()

      try {
        adapter.bondedDevices.orEmpty().map { device ->
          mapOf(
            "address" to device.address,
            "name" to (device.name ?: device.address),
          )
        }
      } catch (e: SecurityException) {
        throw BluetoothPermissionException()
      }
    }

    /**
     * Open a serial link.
     *
     * Three attempts, in order. A secure RFCOMM socket is correct and is what
     * a well-behaved adapter wants. Cheap clones commonly ship a malformed
     * service record, where an insecure socket succeeds and a secure one does
     * not. A few are broken enough that neither service lookup works, and only
     * a direct connection to RFCOMM channel 1 does; that last one needs a
     * hidden method, so it is reached reflectively and treated as optional.
     */
    AsyncFunction("connect") { address: String, preferSecure: Boolean ->
      val adapter = adapterOrNull()
        ?: throw BluetoothUnavailableException("This device has no Bluetooth adapter.")
      if (!hasConnectPermission()) throw BluetoothPermissionException()
      if (!adapter.isEnabled) throw BluetoothUnavailableException("Bluetooth is turned off.")

      closeQuietly()

      val device: BluetoothDevice = try {
        adapter.getRemoteDevice(address)
      } catch (e: IllegalArgumentException) {
        throw BluetoothConnectException("\"$address\" is not a valid Bluetooth address.")
      }

      // Discovery is bandwidth-hungry and makes connecting unreliable.
      try {
        if (adapter.isDiscovering) adapter.cancelDiscovery()
      } catch (_: SecurityException) {
        // Not fatal; carry on and let the connect attempt speak for itself.
      }

      // Typed explicitly: the three factories have different nullability, and
      // leaving Kotlin to infer a common type across them is asking for a
      // compile error that only shows up in CI.
      val secure: () -> BluetoothSocket? =
        { device.createRfcommSocketToServiceRecord(SPP_UUID) }
      val insecure: () -> BluetoothSocket? =
        { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) }
      val channelOne: () -> BluetoothSocket? = { legacyChannelOneSocket(device) }

      val attempts: List<Pair<String, () -> BluetoothSocket?>> =
        if (preferSecure) {
          listOf("secure" to secure, "insecure" to insecure, "channel-1" to channelOne)
        } else {
          listOf("insecure" to insecure, "secure" to secure, "channel-1" to channelOne)
        }

      var lastError = "The adapter refused the connection."

      for ((mode, factory) in attempts) {
        var candidate: BluetoothSocket? = null
        try {
          candidate = factory() ?: continue
          candidate.connect()

          socket = candidate
          output = candidate.outputStream
          startReading(candidate.inputStream)

          return@AsyncFunction mapOf("mode" to mode)
        } catch (e: SecurityException) {
          closeQuietly(candidate)
          throw BluetoothPermissionException()
        } catch (e: Throwable) {
          // Includes IOException from a refused connection and anything a
          // vendor-modified stack decides to raise.
          closeQuietly(candidate)
          lastError = e.message ?: e.javaClass.simpleName
        }
      }

      throw BluetoothConnectException(lastError)
    }

    AsyncFunction("write") { data: String ->
      val stream = output ?: throw BluetoothConnectException("Not connected.")
      try {
        stream.write(data.toByteArray(Charsets.US_ASCII))
        stream.flush()
      } catch (e: IOException) {
        throw BluetoothConnectException(e.message ?: "The link dropped while sending.")
      }
    }

    AsyncFunction("disconnect") {
      closeQuietly()
    }

    OnDestroy {
      closeQuietly()
    }
  }

  // --- internals -----------------------------------------------------------

  private fun context(): Context? = appContext.reactContext

  private fun adapterOrNull(): BluetoothAdapter? {
    val ctx = context() ?: return null
    return try {
      val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      manager?.adapter
    } catch (_: Throwable) {
      null
    }
  }

  /**
   * From Android 12 the Bluetooth calls raise a SecurityException without this
   * permission, and that exception lands in native code where it ends the
   * process. It is checked rather than caught.
   */
  private fun hasConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val ctx = context() ?: return false
    return ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
  }

  /**
   * A direct socket on RFCOMM channel 1, for adapters whose service record is
   * broken enough that neither standard lookup finds the serial profile. The
   * method is hidden, so its absence is treated as this attempt simply not
   * being available.
   */
  private fun legacyChannelOneSocket(device: BluetoothDevice): BluetoothSocket? =
    try {
      val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
      method.invoke(device, 1) as? BluetoothSocket
    } catch (_: Throwable) {
      null
    }

  private fun startReading(input: InputStream) {
    running = true
    readThread = Thread({
      val buffer = ByteArray(1024)
      var reason = "The link closed."

      try {
        while (running) {
          val count = input.read(buffer)
          if (count < 0) {
            reason = "The adapter closed the connection."
            break
          }
          if (count > 0) {
            val chunk = String(buffer, 0, count, Charsets.US_ASCII)
            sendEventSafely("onData", mapOf("data" to chunk))
          }
        }
      } catch (e: Throwable) {
        // An uncaught throw on this thread would end the process, which is
        // precisely the crash this module was written to remove.
        reason = e.message ?: "The link dropped."
      } finally {
        if (running) {
          running = false
          sendEventSafely("onClose", mapOf("reason" to reason))
        }
      }
    }, "obd-bluetooth-read").apply {
      isDaemon = true
      start()
    }
  }

  /**
   * Event delivery that cannot take the app down.
   *
   * Emitting after the runtime has gone away throws, and this runs on a
   * background thread where a throw is fatal.
   */
  private fun sendEventSafely(name: String, body: Map<String, Any?>) {
    try {
      sendEvent(name, body)
    } catch (_: Throwable) {
      // Nothing useful remains: the listener is gone.
    }
  }

  private fun closeQuietly(target: BluetoothSocket? = null) {
    if (target != null) {
      try { target.close() } catch (_: Throwable) { }
      return
    }

    running = false
    try { readThread?.interrupt() } catch (_: Throwable) { }
    readThread = null

    try { output?.close() } catch (_: Throwable) { }
    output = null

    try { socket?.close() } catch (_: Throwable) { }
    socket = null
  }
}
