package dev.mrbean.dshbackground

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

/**
 * Opt-in foreground service: keeps the app process (and its JS runtime with the live Harness
 * connection) running while the app is in the background, so agent notifications still arrive.
 * It does no networking itself. A partial wake lock keeps the CPU awake for the socket; the
 * ongoing notification has a Disconnect action.
 */
class KeepAliveService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra("title") ?: "Connected to your Harness"
    val text = intent?.getStringExtra("text") ?: "You'll be notified when an agent finishes or needs you."
    ensureChannel()
    val notification = build(title, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    if (wakeLock == null) {
      wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dsh:keepalive").apply { setReferenceCounted(false); acquire() }
    }
    running = true
    // If Android kills the process, don't resurrect a notification without the JS runtime behind it.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ID) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Background connection", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Shown while DSH Mobile stays connected in the background."
        setShowBadge(false)
      })
    }
  }

  private fun build(title: String, text: String): Notification {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { PendingIntent.getActivity(this, 0, it, flags) }
    val stop = PendingIntent.getService(this, 1, Intent(this, KeepAliveService::class.java).setAction(ACTION_STOP), flags)
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else @Suppress("DEPRECATION") Notification.Builder(this)
    return b.setSmallIcon(R.drawable.dsh_stat_connected)
      .setContentTitle(title).setContentText(text)
      .setOngoing(true).setShowWhen(false)
      .setContentIntent(open)
      .addAction(Notification.Action.Builder(null, "Disconnect", stop).build())
      .build()
  }

  companion object {
    const val CHANNEL_ID = "dsh-background"
    const val NOTIFICATION_ID = 4210
    const val ACTION_STOP = "dev.mrbean.dshbackground.STOP"
    @Volatile var running = false
  }
}
