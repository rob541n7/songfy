package com.rob.songfy

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Songfy: Alunan yang berdiri sendiri di HP. Python (Chaquopy) menjalankan musicdl dan server
 * Songfy di 127.0.0.1 di dalam aplikasi ini; WebView menampilkan tampilannya dan mesin audio
 * native memutar lagu (bit-perfect ke DAC USB di Android 14+).
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.userAgentString = settings.userAgentString + " Songfy/1.0"
            setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
            // nama jembatan sama dengan Alunan karena tampilan web-nya sama
            addJavascriptInterface(WebBridge(this@MainActivity), "AlunanAndroid")
            addJavascriptInterface(NativeBridge(NativeEngine.get(this@MainActivity)), "AlunanNative")
            addJavascriptInterface(StartBridge(this@MainActivity), "SongfyStart")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.scheme == "file" || url.host == "127.0.0.1") return false
                    return try { startActivity(Intent(Intent.ACTION_VIEW, url)); true } catch (e: Exception) { true }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "audio/*"
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                    }
                    return try {
                        startActivityForResult(Intent.createChooser(intent, "Pilih file musik"), REQ_FILES); true
                    } catch (e: Exception) {
                        fileCallback = null; false
                    }
                }
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)

        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        controller = { cmd -> runOnUiThread { web.evaluateJavascript("window.alunanControl && window.alunanControl('$cmd')", null) } }
        NativeEngine.get(this).emitter = { type, data ->
            web.evaluateJavascript("window.alunanNativeEvent && window.alunanNativeEvent('$type', $data)", null)
        }

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }

        if (serverReady) web.loadUrl(SERVER_URL)
        else {
            web.loadUrl("file:///android_asset/starting.html")
            startServer()
        }
    }

    /** Menyalin tampilan web dari APK, menyalakan Python, lalu menunggu server siap. */
    private fun startServer() {
        val home = filesDir
        val webDir = File(home, "web")
        val library = File(libraryPath())
        val errorFile = File(home, "startup-error.txt")
        if (!serverStarted) {
            serverStarted = true
            copyWebAssets(webDir)
            if (!Python.isStarted()) Python.start(AndroidPlatform(this))
            thread(name = "songfy-server", isDaemon = true) {
                runCatching {
                    Python.getInstance().getModule("songfy_main")
                        .callAttr("start", home.absolutePath, webDir.absolutePath, library.absolutePath, PORT)
                }
            }
        }
        thread(isDaemon = true) {
            val started = System.currentTimeMillis()
            while (System.currentTimeMillis() - started < 120_000) {
                if (errorFile.exists()) {
                    val msg = errorFile.readText()
                    runOnUiThread { showStartError(msg) }
                    return@thread
                }
                if (ping()) {
                    serverReady = true
                    runOnUiThread { web.loadUrl(SERVER_URL) }
                    return@thread
                }
                Thread.sleep(400)
            }
            runOnUiThread { showStartError("Server Songfy tidak menjawab setelah 2 menit.") }
        }
    }

    private val prefs by lazy { getSharedPreferences("songfy", MODE_PRIVATE) }

    /** Folder default: folder pribadi aplikasi (tidak butuh izin, tapi tersembunyi di file manager). */
    fun defaultLibraryPath(): String =
        File(getExternalFilesDir(Environment.DIRECTORY_MUSIC) ?: File(filesDir, "library"), "Songfy").absolutePath

    fun libraryPath(): String = prefs.getString("library", null) ?: defaultLibraryPath()

    fun saveLibraryPath(path: String) = prefs.edit().putString("library", path).apply()

    fun hasAllFilesAccess(): Boolean = if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
    else checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    fun requestAllFilesAccess() = runOnUiThread {
        if (Build.VERSION.SDK_INT >= 30) {
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName"))
            runCatching { startActivity(intent) }.onFailure { startActivity(Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
        } else {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
        }
    }

    /** Membuka pemilih folder Android; hasilnya dikirim ke window.onFolderPicked di app.js. */
    fun pickFolder() = runOnUiThread {
        if (!hasAllFilesAccess()) {
            web.evaluateJavascript("window.onFolderPicked && window.onFolderPicked(null, 'permission')", null)
            requestAllFilesAccess()
            return@runOnUiThread
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        runCatching { startActivityForResult(intent, REQ_FOLDER) }
            .onFailure { web.evaluateJavascript("window.onFolderPicked && window.onFolderPicked(null, 'unsupported')", null) }
    }

    /** content://.../tree/primary:Music/Songfy  ->  /storage/emulated/0/Music/Songfy */
    private fun treeUriToPath(uri: Uri): String? {
        val id = runCatching { android.provider.DocumentsContract.getTreeDocumentId(uri) }.getOrNull() ?: return null
        val volume = id.substringBefore(':')
        val rel = id.substringAfter(':', "")
        val base = if (volume.equals("primary", ignoreCase = true)) Environment.getExternalStorageDirectory().absolutePath else "/storage/$volume"
        return if (rel.isEmpty()) base else "$base/$rel"
    }

    /** Agar lagu baru langsung terlihat di aplikasi musik & galeri lain. */
    fun mediaScan(path: String) {
        android.media.MediaScannerConnection.scanFile(this, arrayOf(path), null, null)
    }

    private fun showStartError(msg: String) {
        web.evaluateJavascript("window.showError && window.showError(${JSONObject.quote(msg)})", null)
    }

    private fun ping(): Boolean = try {
        val conn = URL("$SERVER_URL/static/icon.svg").openConnection() as HttpURLConnection
        conn.connectTimeout = 500
        conn.readTimeout = 1000
        conn.responseCode == 200
    } catch (e: Exception) {
        false
    }

    /** Tampilan web disalin ulang setiap kali versi aplikasi berubah. */
    private fun copyWebAssets(dest: File) {
        val stamp = File(dest, ".version")
        val version = packageManager.getPackageInfo(packageName, 0).lastUpdateTime.toString()
        if (stamp.exists() && stamp.readText() == version) return
        dest.deleteRecursively()
        dest.mkdirs()
        for (name in assets.list("web").orEmpty()) {
            assets.open("web/$name").use { input -> File(dest, name).outputStream().use { input.copyTo(it) } }
        }
        stamp.writeText(version)
    }

    fun retry() = runOnUiThread {
        File(filesDir, "startup-error.txt").delete()
        // Python tidak bisa dimulai ulang di proses yang sama: tutup aplikasi agar dibuka bersih
        finishAffinity()
        Runtime.getRuntime().exit(0)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    @Deprecated("Activity result API sederhana untuk WebView")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FOLDER) {
            val path = data?.data?.takeIf { resultCode == RESULT_OK }?.let { treeUriToPath(it) }
            web.evaluateJavascript("window.onFolderPicked && window.onFolderPicked(${if (path == null) "null" else JSONObject.quote(path)}, ${if (resultCode == RESULT_OK) "'invalid'" else "'cancel'"})", null)
            return
        }
        if (requestCode != REQ_FILES) return
        val uris = mutableListOf<Uri>()
        if (resultCode == RESULT_OK && data != null) {
            data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
            if (uris.isEmpty()) data.data?.let { uris.add(it) }
        }
        fileCallback?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        fileCallback = null
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    // Sengaja tidak memanggil web.onPause(): audio & server tetap jalan di latar belakang.

    override fun onDestroy() {
        controller = null
        NativeEngine.get(this).emitter = null
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val PORT = 5170
        const val SERVER_URL = "http://127.0.0.1:$PORT"
        private const val REQ_FILES = 10
        private const val REQ_NOTIF = 11
        private const val REQ_FOLDER = 12
        private const val REQ_STORAGE = 13

        @Volatile private var serverStarted = false
        @Volatile private var serverReady = false

        /** Dipakai PlaybackService untuk meneruskan tombol notifikasi ke halaman web. */
        @Volatile var controller: ((String) -> Unit)? = null
    }
}

/** Notifikasi pemutar (window.AlunanAndroid di app.js). */
class WebBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun update(json: String) {
        val o = JSONObject(json)
        if (o.optBoolean("playing")) PlaybackService.closedByUser = false
        if (PlaybackService.closedByUser) return
        if (!o.optBoolean("hasTrack")) {
            activity.stopService(Intent(activity, PlaybackService::class.java))
            return
        }
        val intent = Intent(activity, PlaybackService::class.java).apply {
            action = PlaybackService.ACTION_UPDATE
            putExtra("hasTrack", true)
            putExtra("title", o.optString("title"))
            putExtra("artist", o.optString("artist"))
            putExtra("cover", o.optString("cover"))
            putExtra("playing", o.optBoolean("playing"))
        }
        try { activity.startForegroundService(intent) } catch (e: Exception) { /* dicoba lagi di pembaruan berikutnya */ }
    }

    // ---- folder unduhan (Pengaturan → Folder unduhan)
    @JavascriptInterface fun libraryPath(): String = activity.libraryPath()
    @JavascriptInterface fun defaultLibraryPath(): String = activity.defaultLibraryPath()
    @JavascriptInterface fun saveLibraryPath(path: String) = activity.saveLibraryPath(path)
    @JavascriptInterface fun hasAllFilesAccess(): Boolean = activity.hasAllFilesAccess()
    @JavascriptInterface fun pickFolder() = activity.pickFolder()
    @JavascriptInterface fun mediaScan(path: String) = activity.mediaScan(path)

    /** Songfy tidak memakai server di komputer, jadi tidak ada alamat untuk diganti. */
    @JavascriptInterface fun server(): String = ""
    @JavascriptInterface fun changeServer() = Unit
}

/** Halaman starting.html: tombol "Coba lagi" saat Python gagal dinyalakan. */
class StartBridge(private val activity: MainActivity) {
    @JavascriptInterface fun retry() = activity.retry()
}

/** Mesin audio native untuk app.js (window.AlunanNative). */
class NativeBridge(private val engine: NativeEngine) {
    @JavascriptInterface fun load(url: String, meta: String) = engine.load(url, JSONObject(meta.ifEmpty { "{}" }))
    @JavascriptInterface fun preload(url: String, meta: String) = engine.preload(url, JSONObject(meta.ifEmpty { "{}" }))
    @JavascriptInterface fun play() = engine.play()
    @JavascriptInterface fun pause() = engine.pause()
    @JavascriptInterface fun seek(ms: Double) = engine.seek(ms.toLong())
    @JavascriptInterface fun setVolume(v: Double) = engine.setVolume(v.toFloat())
    @JavascriptInterface fun setBitPerfect(on: Boolean) = engine.setBitPerfect(on)
    @JavascriptInterface fun setEq(on: Boolean, gains: String) {
        val arr = org.json.JSONArray(gains)
        engine.setEq(on, FloatArray(10) { arr.optDouble(it, 0.0).toFloat() })
    }
    @JavascriptInterface fun info(): String = engine.info().toString()
}
