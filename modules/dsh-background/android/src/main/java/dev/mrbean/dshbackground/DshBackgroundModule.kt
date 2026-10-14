package dev.mrbean.dshbackground

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DshBackgroundModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App context is not available.", null)

  override fun definition() = ModuleDefinition {
    Name("DshBackground")

    Function("start") { title: String, text: String ->
      val intent = Intent(context, KeepAliveService::class.java).putExtra("title", title).putExtra("text", text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    Function("stop") {
      context.startService(Intent(context, KeepAliveService::class.java).setAction(KeepAliveService.ACTION_STOP))
    }

    Function("isRunning") { KeepAliveService.running }

    Function("isIgnoringBatteryOptimizations") {
      (context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    }

    @SuppressLint("BatteryLife")
    Function("requestIgnoreBatteryOptimizations") {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try { context.startActivity(intent) } catch (_: Exception) {
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    Function("openAppSettings") {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
