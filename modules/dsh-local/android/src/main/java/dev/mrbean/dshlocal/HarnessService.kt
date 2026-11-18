package dev.mrbean.dshlocal

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import java.io.FileOutputStream

/**
 * Foreground service that keeps `dsh web` running inside the container while the user wants it,
 * even with the app closed. Output goes to local/harness.log (the app reads the token from it).
 * Stopping the service ends the Harness (proot --kill-on-exit takes the whole tree down).
 */
class HarnessService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) { shutdown(); stopSelf(); return START_NOT_STICKY }
    if (intent?.action == ACTION_TASK) { runTask(intent.getStringExtra("script") ?: return START_NOT_STICKY); return START_NOT_STICKY }
    val port = intent?.getIntExtra("port", 3080) ?: 3080
    ensureChannel()
    val notification = build("DeepSeek Harness is running on this device", "Open DSH Mobile to use it. Tap Stop to shut it down.")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(NOTIFICATION_ID, notification)
    if (process?.isAlive != true) launch(port)
    if (wakeLock == null) wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dsh:local-harness").apply { setReferenceCounted(false); acquire() }
    running = true
    return START_NOT_STICKY
  }

  private fun launch(port: Int) {
    val env = LocalEnv(this)
    env.log.parentFile?.mkdirs()
    FileOutputStream(env.log, false).use { it.write("--- starting dsh web on 127.0.0.1:$port ---\n".toByteArray()) }
    // `exec` so the Harness replaces the shell; --trusted-host lets the app reach it as 127.0.0.1.
    val proc = env.command("cd /root/projects && exec dsh web --no-open --host 127.0.0.1 --port $port --trusted-host 127.0.0.1:$port")
      .redirectOutput(ProcessBuilder.Redirect.appendTo(env.log)).start()
    process = proc
    Thread {
      val code = try { proc.waitFor() } catch (_: InterruptedException) { -1 }
      FileOutputStream(env.log, true).use { it.write("--- dsh web exited ($code) ---\n".toByteArray()) }
      if (process === proc) { running = false; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    }.apply { isDaemon = true; start() }
  }

  /**
   * Long setup work (installing/updating the Harness with npm) runs here, not in the app, so it
   * survives the app being backgrounded or killed for memory. Output goes to local/task.log;
   * the app polls taskState()/the log. Ends with a "--- task exited (N) ---" line.
   */
  private fun runTask(script: String) {
    ensureChannel()
    val n = build("Setting up DeepSeek Harness", "Installing… this can take several minutes. Keep the app installed.")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(NOTIFICATION_ID, n)
    if (task?.isAlive == true) return
    if (wakeLock == null) wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dsh:local-task").apply { setReferenceCounted(false); acquire() }
    val env = LocalEnv(this)
    FileOutputStream(env.taskLog, false).use { it.write("--- task started ---\n".toByteArray()) }
    val proc = env.command(script).redirectOutput(ProcessBuilder.Redirect.appendTo(env.taskLog)).start()
    task = proc
    Thread {
      val code = try { proc.waitFor() } catch (_: InterruptedException) { -1 }
      FileOutputStream(env.taskLog, true).use { it.write("--- task exited ($code) ---\n".toByteArray()) }
      task = null
      // Keep the service only if the Harness itself is running.
      if (process?.isAlive != true) { wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    }.apply { isDaemon = true; start() }
  }

  private fun shutdown() {
    running = false
    killHarness()
    wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  override fun onDestroy() { shutdown(); super.onDestroy() }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Local Harness", NotificationManager.IMPORTANCE_LOW).apply { description = "Shown while the Harness runs on this device" })
  }

  private fun build(title: String, text: String): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE) }
    val stop = PendingIntent.getService(this, 1, Intent(this, HarnessService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    return b.setContentTitle(title).setContentText(text).setSmallIcon(android.R.drawable.stat_sys_upload_done).setOngoing(true)
      .setContentIntent(open).addAction(Notification.Action.Builder(null, "Stop", stop).build()).build()
  }

  companion object {
    const val ACTION_STOP = "dev.mrbean.dshlocal.STOP"
    const val ACTION_TASK = "dev.mrbean.dshlocal.TASK"
    private const val CHANNEL = "dsh-local-harness"
    private const val NOTIFICATION_ID = 4102
    @Volatile var running = false
    /** Process-wide (not per service instance): Stop may reach a new instance of the service. */
    @Volatile var process: Process? = null
    @Volatile var task: Process? = null

    /**
     * Stop the Harness and everything proot started. Process.destroy() only signals proot; its
     * tracees (node) can outlive it, so also signal every descendant, found via /proc (all ours).
     */
    fun killHarness() {
      val p = process ?: return
      process = null
      val root = try { p.javaClass.getDeclaredField("pid").apply { isAccessible = true }.getInt(p) } catch (_: Exception) { -1 }
      val pids = if (root > 0) descendants(root) + root else emptyList()
      for (pid in pids) try { android.os.Process.sendSignal(pid, 15) } catch (_: Exception) {}
      p.destroy()
      if (!p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) {
        for (pid in pids) try { android.os.Process.killProcess(pid) } catch (_: Exception) {}
        p.destroyForcibly()
      }
    }

    private fun descendants(root: Int): List<Int> {
      val parent = mutableMapOf<Int, Int>()
      java.io.File("/proc").listFiles()?.forEach { d ->
        val pid = d.name.toIntOrNull() ?: return@forEach
        try {
          val stat = java.io.File(d, "stat").readText()
          val ppid = stat.substringAfterLast(')').trim().split(' ')[1].toInt()
          parent[pid] = ppid
        } catch (_: Exception) {}
      }
      val out = mutableListOf<Int>(); var frontier = listOf(root)
      while (frontier.isNotEmpty()) { frontier = parent.filter { it.value in frontier }.keys.toList(); out += frontier }
      return out
    }
  }
}
