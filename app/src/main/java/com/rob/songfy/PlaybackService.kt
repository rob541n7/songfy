package com.rob.songfy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.net.wifi.WifiManager
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Layanan latar depan: menampilkan notifikasi pemutar (sampul, judul, tombol) dan menjaga
 * aplikasi tetap hidup selama musik diputar dari WebView. Tombolnya diteruskan ke app.js.
 */
class PlaybackService : Service() {

    private lateinit var session: MediaSessionCompat
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var title = ""
    private var artist = ""
    private var playing = false
    private var coverUrl = ""
    private var cover: Bitmap? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW).apply {
            description = getString(R.string.channel_desc)
            setShowBadge(false)
        })
        session = MediaSessionCompat(this, "Songfy").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = send("play")
                override fun onPause() = send("pause")
                override fun onSkipToNext() = send("next")
                override fun onSkipToPrevious() = send("prev")
                override fun onStop() = send("pause")
            })
            isActive = true
        }
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Songfy:playback")
        // streaming dari komputer lewat WiFi tetap lancar saat layar mati
        @Suppress("DEPRECATION")
        wifiLock = applicationContext.getSystemService(WifiManager::class.java)
            ?.createWifiLock(if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Songfy:stream")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE -> {
                title = intent.getStringExtra("title").orEmpty()
                artist = intent.getStringExtra("artist").orEmpty()
                playing = intent.getBooleanExtra("playing", false)
                val newCover = intent.getStringExtra("cover").orEmpty()
                if (newCover != coverUrl) {
                    coverUrl = newCover
                    cover = null
                    if (newCover.isNotEmpty()) loadCover(newCover)
                }
            }
            ACTION_CMD -> {
                val cmd = intent.getStringExtra("cmd").orEmpty()
                if (cmd == "close") {
                    closedByUser = true
                    send("pause")
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return START_NOT_STICKY
                }
                send(cmd)
            }
        }
        updateSession()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIF_ID, notification)
        holdWakeLock(playing)
        return START_NOT_STICKY
    }

    private fun send(cmd: String) {
        MainActivity.controller?.invoke(cmd)
    }

    private fun holdWakeLock(on: Boolean) {
        val lock = wakeLock ?: return
        if (on && !lock.isHeld) lock.acquire(6 * 60 * 60 * 1000L)
        if (!on && lock.isHeld) lock.release()
        wifiLock?.let { if (on && !it.isHeld) it.acquire(); if (!on && it.isHeld) it.release() }
    }

    private fun updateSession() {
        session.setMetadata(MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .apply { cover?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
            .build())
        session.setPlaybackState(PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build())
    }

    private fun action(cmd: String, code: Int): PendingIntent =
        PendingIntent.getService(this, code, Intent(this, PlaybackService::class.java).setAction(ACTION_CMD).putExtra("cmd", cmd),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title.ifEmpty { "Songfy" })
            .setContentText(artist)
            .setLargeIcon(cover)
            .setContentIntent(open)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setColor(0xFF1ED760.toInt())
            .addAction(R.drawable.ic_prev, "Sebelumnya", action("prev", 1))
            .addAction(if (playing) R.drawable.ic_pause else R.drawable.ic_play, if (playing) "Jeda" else "Putar", action("toggle", 2))
            .addAction(R.drawable.ic_next, "Berikutnya", action("next", 3))
            .addAction(R.drawable.ic_close, "Tutup", action("close", 4))
            .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    /** Sampul diambil memakai cookie login WebView (sampul dari pustaka butuh PIN). */
    private fun loadCover(url: String) {
        thread(isDaemon = true) {
            val bmp = try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }
                conn.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (e: Exception) {
                null
            }
            if (bmp != null && url == coverUrl) {
                cover = bmp
                updateSession()
                getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
            }
        }
    }

    override fun onDestroy() {
        holdWakeLock(false)
        session.release()
        super.onDestroy()
    }

    companion object {
        const val ACTION_UPDATE = "com.rob.songfy.UPDATE"
        const val ACTION_CMD = "com.rob.songfy.CMD"
        private const val CHANNEL = "playback"
        private const val NOTIF_ID = 7

        /** Notifikasi ditutup lewat tombol "Tutup": jangan muncul lagi sampai lagu diputar kembali. */
        @Volatile
        var closedByUser = false
    }
}
