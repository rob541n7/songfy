package com.rob.songfy

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioMixerAttributes
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToLong
import kotlin.math.sqrt

/**
 * Mesin audio native Songfy (sama dengan Alunan).
 *
 * Mendekode lagu sendiri (MediaExtractor + MediaCodec) lalu menulis ke AudioTrack dengan format
 * yang dipilih sendiri. Di Android 14+ dengan DAC USB, mesin meminta mode mixer "bit-perfect"
 * ke sistem dan menulis sampel integer yang persis sama dengan isi file (16/24/32-bit), tanpa
 * resampling, efek, atau volume perangkat lunak. Lagu berikutnya yang formatnya sama ditulis ke
 * AudioTrack yang sama sehingga tidak ada jeda (gapless).
 */
class NativeEngine(context: Context) {

    data class Source(val url: String, val title: String, val bits: Int, val rate: Int)

    private class Decoder(val src: Source, val extractor: MediaExtractor, val codec: MediaCodec, val rate: Int, val channels: Int, val durationUs: Long,
                          /** audio/raw: MediaExtractor sudah mendekode (mis. FLAC); format PCM-nya ditentukan extractor, bukan codec */
                          val rawFloat: Boolean? = null) {
        var inputDone = false
        var outputDone = false
        var floatOut = rawFloat ?: false
        fun release() {
            runCatching { codec.stop() }
            runCatching { codec.release() }
            runCatching { extractor.release() }
        }
    }

    /** Potongan lagu di dalam AudioTrack yang sama: frame ke-[startFrame] adalah awal [src]. */
    private class Segment(val startFrame: Long, val src: Source, val startUs: Long, val durationUs: Long)

    private val ctx = context.applicationContext
    private val am = ctx.getSystemService(AudioManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val signal = Object()
    private val prefs = ctx.getSharedPreferences("songfy", Context.MODE_PRIVATE)

    /** Dipasang oleh MainActivity untuk meneruskan event ke halaman web. */
    @Volatile var emitter: ((String, JSONObject) -> Unit)? = null

    // perintah dari halaman web
    @Volatile private var pendingLoad: Source? = null
    @Volatile private var pendingSeekUs = -1L
    @Volatile private var wantPlay = false
    @Volatile private var nextSrc: Source? = null
    @Volatile private var eqOn = false
    @Volatile private var eqGains = FloatArray(10)
    @Volatile private var softVolume = 1f
    @Volatile var bitPerfectEnabled = prefs.getBoolean("bitPerfect", true)
        private set

    // status pemutaran (dibaca dari thread utama)
    private var cur: Decoder? = null
    private var next: Decoder? = null
    private var track: AudioTrack? = null
    private var trackRate = 0
    private var trackChannels = 0
    private var trackEncoding = 0
    private var dynamics: DynamicsProcessing? = null
    @Volatile private var framesWritten = 0L
    private val segments = ArrayDeque<Segment>()
    @Volatile private var allDone = false
    @Volatile private var output = JSONObject()
    private var bitPerfectActive = false
    private var focusRequest: AudioFocusRequest? = null
    private var outBuf: ByteBuffer = ByteBuffer.allocateDirect(64 * 1024).order(ByteOrder.nativeOrder())

    private val mediaAttrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    private val worker = Thread({ loop() }, "songfy-audio").apply { isDaemon = true; start() }

    init {
        main.post(object : Runnable {
            override fun run() {
                poll()
                main.postDelayed(this, 250)
            }
        })
        // DAC dicabut: jeda seperti pemutar musik lain
        ContextCompat.registerReceiver(ctx, object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                if (wantPlay) { pause(); emit("pause") }
            }
        }, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        am.registerAudioDeviceCallback(object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = emit("devices", deviceInfo())
            override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = emit("devices", deviceInfo())
        }, main)
    }

    // ---------------------------------------------------------------- API untuk WebView

    fun load(url: String, meta: JSONObject) {
        pendingLoad = Source(url, meta.optString("title"), meta.optInt("bits", 0), meta.optInt("rate", 0))
        nextSrc = null
        wake()
    }

    fun preload(url: String, meta: JSONObject) {
        nextSrc = if (url.isEmpty()) null else Source(url, meta.optString("title"), meta.optInt("bits", 0), meta.optInt("rate", 0))
        wake()
    }

    fun play() {
        if (!requestFocus()) return
        wantPlay = true
        wake()
    }

    fun pause() {
        wantPlay = false
        runCatching { track?.pause() }
        wake()
    }

    fun seek(ms: Long) {
        pendingSeekUs = ms * 1000
        wake()
    }

    fun setVolume(v: Float) {
        softVolume = v.coerceIn(0f, 1f)
        // dalam mode bit-perfect volume diatur oleh tombol volume HP/DAC, bukan oleh aplikasi
        if (!bitPerfectActive) runCatching { track?.setVolume(softVolume) }
    }

    fun setBitPerfect(on: Boolean) {
        bitPerfectEnabled = on
        prefs.edit().putBoolean("bitPerfect", on).apply()
        emit("devices", deviceInfo())
    }

    fun setEq(on: Boolean, gains: FloatArray) {
        eqOn = on
        eqGains = gains.copyOf(10)
        applyEq()
    }

    fun info(): JSONObject = deviceInfo().put("output", output)

    // ---------------------------------------------------------------- perangkat & bit-perfect

    private fun usbOutput(): AudioDeviceInfo? = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull {
        it.type == AudioDeviceInfo.TYPE_USB_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_DEVICE
    }

    private fun deviceInfo(): JSONObject {
        val usb = usbOutput()
        val o = JSONObject()
            .put("sdk", Build.VERSION.SDK_INT)
            .put("bitPerfectSupported", Build.VERSION.SDK_INT >= 34)
            .put("bitPerfectEnabled", bitPerfectEnabled)
            .put("usb", usb?.productName?.toString() ?: JSONObject.NULL)
        if (usb != null) {
            o.put("usbRates", usb.sampleRates.joinToString(", "))
            o.put("usbEncodings", usb.encodings.joinToString(", ") { encodingName(it) })
            if (Build.VERSION.SDK_INT >= 34) {
                val bp = am.getSupportedMixerAttributes(usb).filter { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT }
                o.put("bitPerfectFormats", bp.joinToString(", ") { "${encodingName(it.format.encoding)}/${it.format.sampleRate / 1000.0}k" })
            }
        }
        return o
    }

    /** Memilih encoding AudioTrack; di Android 14+ dengan DAC USB sekaligus mengatur mixer bit-perfect. */
    private fun chooseEncoding(rate: Int, channels: Int, srcBits: Int): Int {
        bitPerfectActive = false
        val usb = usbOutput()
        if (Build.VERSION.SDK_INT >= 34 && usb != null) {
            if (bitPerfectEnabled) {
                val candidates = am.getSupportedMixerAttributes(usb).filter {
                    it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT &&
                        it.format.sampleRate == rate && it.format.channelCount == channels
                }
                val order = if (srcBits in 1..16) listOf(AudioFormat.ENCODING_PCM_16BIT, AudioFormat.ENCODING_PCM_24BIT_PACKED, AudioFormat.ENCODING_PCM_32BIT)
                else listOf(AudioFormat.ENCODING_PCM_24BIT_PACKED, AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_16BIT)
                val pick = order.firstNotNullOfOrNull { enc -> candidates.firstOrNull { it.format.encoding == enc } }
                if (pick != null && am.setPreferredMixerAttributes(mediaAttrs, usb, pick)) {
                    bitPerfectActive = true
                    return pick.format.encoding
                }
            }
            runCatching { am.clearPreferredMixerAttributes(mediaAttrs, usb) }
        }
        return if (srcBits > 16 || srcBits == 0) AudioFormat.ENCODING_PCM_FLOAT else AudioFormat.ENCODING_PCM_16BIT
    }

    private fun ensureTrack(dec: Decoder) {
        val srcBits = dec.src.bits.takeIf { it > 0 } ?: if (dec.floatOut) 24 else 16
        val t = track
        if (t != null && trackRate == dec.rate && trackChannels == dec.channels) {
            val wanted = chooseEncodingPreview(dec.rate, dec.channels, srcBits)
            if (wanted == trackEncoding) return
        }
        releaseTrack()
        val enc = chooseEncoding(dec.rate, dec.channels, srcBits)
        val mask = if (dec.channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
        val fmt = AudioFormat.Builder().setEncoding(enc).setSampleRate(dec.rate).setChannelMask(mask).build()
        val min = AudioTrack.getMinBufferSize(dec.rate, mask, enc).coerceAtLeast(4096)
        val bytesPerSec = dec.rate * dec.channels * bytesPerSample(enc)
        val created = AudioTrack.Builder()
            .setAudioAttributes(mediaAttrs)
            .setAudioFormat(fmt)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(maxOf(min * 4, bytesPerSec * 2)) // ±2 detik: cukup untuk membuka lagu berikutnya tanpa putus
            .build()
        created.setVolume(if (bitPerfectActive) 1f else softVolume)
        track = created
        trackRate = dec.rate
        trackChannels = dec.channels
        trackEncoding = enc
        framesWritten = 0
        synchronized(segments) { segments.clear() }
        attachEq(created.audioSessionId, dec.channels)
        if (wantPlay) created.play()
        val usb = usbOutput()
        output = JSONObject()
            .put("device", usb?.productName?.toString() ?: "Speaker / perangkat bawaan")
            .put("usb", usb != null)
            .put("rate", dec.rate)
            .put("channels", dec.channels)
            .put("bits", bitsOf(enc))
            .put("encoding", encodingName(enc))
            .put("sourceBits", srcBits)
            .put("decoderFloat", dec.floatOut)
            .put("bitPerfect", bitPerfectActive)
            .put("bitPerfectEnabled", bitPerfectEnabled)
            .put("sdk", Build.VERSION.SDK_INT)
        emit("output", output)
    }

    /** Encoding yang akan dipilih tanpa mengubah pengaturan sistem (untuk memutuskan apakah AudioTrack bisa dipakai ulang). */
    private fun chooseEncodingPreview(rate: Int, channels: Int, srcBits: Int): Int {
        if (bitPerfectActive && Build.VERSION.SDK_INT >= 34) {
            val usb = usbOutput() ?: return -1
            val pref = am.getPreferredMixerAttributes(mediaAttrs, usb) ?: return -1
            return if (pref.format.sampleRate == rate && pref.format.channelCount == channels) pref.format.encoding else -1
        }
        if (Build.VERSION.SDK_INT >= 34 && bitPerfectEnabled && usbOutput() != null) return -1 // coba lagi masuk mode bit-perfect
        return if (srcBits > 16 || srcBits == 0) AudioFormat.ENCODING_PCM_FLOAT else AudioFormat.ENCODING_PCM_16BIT
    }

    private fun releaseTrack() {
        runCatching { dynamics?.release() }
        dynamics = null
        track?.let { runCatching { it.pause(); it.flush(); it.release() } }
        track = null
    }

    // ---------------------------------------------------------------- equalizer (dimatikan saat bit-perfect)

    private val bandCenters = floatArrayOf(32f, 64f, 125f, 250f, 500f, 1000f, 2000f, 4000f, 8000f, 16000f)

    private fun attachEq(session: Int, channels: Int) {
        runCatching { dynamics?.release() }
        dynamics = null
        if (bitPerfectActive || Build.VERSION.SDK_INT < 28) return
        runCatching {
            val cfg = DynamicsProcessing.Config.Builder(DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, channels,
                true, 10, false, 0, false, 0, false).build()
            dynamics = DynamicsProcessing(0, session, cfg)
            applyEq()
        }
    }

    private fun applyEq() {
        val dp = dynamics ?: return
        runCatching {
            for (i in 0 until 10) {
                val cutoff = if (i < 9) sqrt(bandCenters[i] * bandCenters[i + 1]) else 20000f
                dp.setPreEqBandAllChannelsTo(i, DynamicsProcessing.EqBand(true, cutoff, if (eqOn) eqGains[i] else 0f))
            }
            dp.enabled = eqOn && !bitPerfectActive
        }
    }

    // ---------------------------------------------------------------- audio focus

    private fun requestFocus(): Boolean {
        val req = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(mediaAttrs)
            .setOnAudioFocusChangeListener({ change ->
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    if (wantPlay) { pause(); emit("pause") }
                }
            }, main)
            .build().also { focusRequest = it }
        return am.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    // ---------------------------------------------------------------- thread dekode

    private fun wake() = synchronized(signal) { signal.notifyAll() }

    private fun sleep(ms: Long) = synchronized(signal) { signal.wait(ms) }

    private fun headers(url: String): Map<String, String> =
        CookieManager.getInstance().getCookie(url)?.let { mapOf("Cookie" to it) } ?: emptyMap()

    private fun open(src: Source): Decoder {
        val ex = MediaExtractor()
        ex.setDataSource(src.url, headers(src.url))
        val idx = (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
            ?: run { ex.release(); error("Tidak ada trek audio di file ini") }
        ex.selectTrack(idx)
        val f = ex.getTrackFormat(idx)
        val mime = f.getString(MediaFormat.KEY_MIME)!!
        val codec = MediaCodec.createDecoderByType(mime)
        val dur = if (f.containsKey(MediaFormat.KEY_DURATION)) f.getLong(MediaFormat.KEY_DURATION) else 0L
        val rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        if (mime == MediaFormat.MIMETYPE_AUDIO_RAW) {
            // Extractor Android sudah mendekode FLAC/WAV menjadi PCM (16-bit, atau float untuk file >16-bit).
            // "Dekoder" raw hanya meneruskan data, jadi jangan minta format lain darinya.
            val enc = if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) f.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
            if (enc != AudioFormat.ENCODING_PCM_16BIT && enc != AudioFormat.ENCODING_PCM_FLOAT) {
                codec.release(); ex.release(); error("Format PCM $enc belum didukung")
            }
            codec.configure(f, null, null, 0)
            codec.start()
            return Decoder(src, ex, codec, rate, channels, dur, rawFloat = enc == AudioFormat.ENCODING_PCM_FLOAT)
        }
        // dekoder sungguhan: minta keluaran float agar sumber 24-bit tidak dipotong menjadi 16-bit
        f.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_FLOAT)
        val floatOk = runCatching { codec.configure(f, null, null, 0) }.isSuccess
        if (!floatOk) {
            codec.reset()
            f.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            codec.configure(f, null, null, 0)
        }
        codec.start()
        return Decoder(src, ex, codec, rate, channels, dur)
    }

    private fun loop() {
        val info = MediaCodec.BufferInfo()
        while (true) {
            try {
                pendingLoad?.let { src ->
                    pendingLoad = null
                    pendingSeekUs = -1
                    cur?.release(); next?.release(); next = null
                    releaseTrack()
                    allDone = false
                    emit("waiting")
                    cur = open(src)
                    emit("loadedmetadata", JSONObject().put("duration", cur!!.durationUs / 1e6))
                    ensureTrack(cur!!.also { primeFloat(it) })
                    synchronized(segments) { segments.add(Segment(0, src, 0, cur!!.durationUs)) }
                }
                val dec = cur
                if (dec == null) { sleep(500); continue }

                if (pendingSeekUs >= 0) {
                    val us = pendingSeekUs
                    pendingSeekUs = -1
                    next?.release(); next = null
                    dec.codec.flush()
                    dec.extractor.seekTo(us, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
                    dec.inputDone = false; dec.outputDone = false
                    allDone = false
                    track?.let { it.pause(); it.flush(); if (wantPlay) it.play() }
                    framesWritten = 0
                    val actual = dec.extractor.sampleTime.coerceAtLeast(0)
                    synchronized(segments) { segments.clear(); segments.add(Segment(0, dec.src, actual, dec.durationUs)) }
                }

                if (!wantPlay) { sleep(1000); continue }
                val t = track ?: run { ensureTrack(dec); track!! }
                if (t.playState != AudioTrack.PLAYSTATE_PLAYING) { t.play(); emit("playing") }

                // buka lagu berikutnya lebih awal (untuk gapless) saat sisa lagu < 15 detik
                val upcoming = nextSrc
                if (upcoming != null && next == null && dec.durationUs > 0 && dec.durationUs - positionUs() < 15_000_000) {
                    nextSrc = null
                    next = runCatching { open(upcoming).also { primeFloat(it) } }.getOrNull()
                }

                if (dec.outputDone) {
                    val n = next
                    if (n != null && n.rate == trackRate && n.channels == trackChannels && chooseEncodingPreview(n.rate, n.channels, n.src.bits.takeIf { it > 0 } ?: if (n.floatOut) 24 else 16) == trackEncoding) {
                        // gapless: lanjut menulis lagu berikutnya ke AudioTrack yang sama
                        synchronized(segments) { segments.add(Segment(framesWritten, n.src, 0, n.durationUs)) }
                        dec.release(); cur = n; next = null
                        continue
                    }
                    // tunggu sisa audio habis diputar
                    if (playedFrames() < framesWritten) { sleep(20); continue }
                    if (n != null) {
                        dec.release(); cur = n; next = null
                        releaseTrack()
                        ensureTrack(n)
                        synchronized(segments) { segments.add(Segment(0, n.src, 0, n.durationUs)) }
                        emit("gapless")
                        emit("loadedmetadata", JSONObject().put("duration", n.durationUs / 1e6))
                        continue
                    }
                    if (!allDone) { allDone = true; wantPlay = false; emit("ended") }
                    sleep(500)
                    continue
                }

                if (!dec.inputDone) {
                    val inIdx = dec.codec.dequeueInputBuffer(5000)
                    if (inIdx >= 0) {
                        val buf = dec.codec.getInputBuffer(inIdx)!!
                        val size = dec.extractor.readSampleData(buf, 0)
                        if (size < 0) {
                            dec.codec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            dec.inputDone = true
                        } else {
                            dec.codec.queueInputBuffer(inIdx, 0, size, dec.extractor.sampleTime, 0)
                            dec.extractor.advance()
                        }
                    }
                }
                val outIdx = dec.codec.dequeueOutputBuffer(info, 5000)
                if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (dec.rawFloat == null) dec.floatOut = dec.codec.outputFormat.let { it.containsKey(MediaFormat.KEY_PCM_ENCODING) && it.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT }
                } else if (outIdx >= 0) {
                    if (info.size > 0 && cur === dec && pendingSeekUs < 0 && pendingLoad == null) {
                        val data = dec.codec.getOutputBuffer(outIdx)!!
                        data.position(info.offset); data.limit(info.offset + info.size)
                        writePcm(t, data.order(ByteOrder.nativeOrder()), dec.floatOut, dec.channels)
                    }
                    dec.codec.releaseOutputBuffer(outIdx, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) dec.outputDone = true
                }
            } catch (e: Throwable) {
                Log.e("SongfyEngine", "playback failed", e)
                cur?.release(); cur = null
                next?.release(); next = null
                releaseTrack()
                wantPlay = false
                emit("error", JSONObject().put("message", e.message ?: e.toString()))
            }
        }
    }

    /** Ambil format keluaran dekoder (float atau 16-bit) sebelum AudioTrack dibuat. */
    private fun primeFloat(dec: Decoder) {
        if (dec.rawFloat != null) return
        dec.floatOut = runCatching {
            dec.codec.outputFormat.let { it.containsKey(MediaFormat.KEY_PCM_ENCODING) && it.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT }
        }.getOrDefault(false)
    }

    /** Ubah PCM keluaran dekoder ke encoding AudioTrack. Untuk sumber ≤24-bit konversinya tanpa kehilangan data. */
    private fun writePcm(t: AudioTrack, src: ByteBuffer, srcFloat: Boolean, channels: Int) {
        val samples = if (srcFloat) src.remaining() / 4 else src.remaining() / 2
        val outBytes = samples * bytesPerSample(trackEncoding)
        if (outBuf.capacity() < outBytes) outBuf = ByteBuffer.allocateDirect(outBytes * 2).order(ByteOrder.nativeOrder())
        val out = outBuf
        out.clear()
        val f = if (srcFloat) src.asFloatBuffer() else null
        val s = if (srcFloat) null else src.asShortBuffer()
        for (i in 0 until samples) {
            when (trackEncoding) {
                AudioFormat.ENCODING_PCM_FLOAT -> out.putFloat(f?.get(i) ?: (s!!.get(i) / 32768f))
                AudioFormat.ENCODING_PCM_16BIT -> out.putShort(f?.let { floatToInt(it.get(i), 32768.0, 15).toShort() } ?: s!!.get(i))
                AudioFormat.ENCODING_PCM_24BIT_PACKED -> {
                    val v = f?.let { floatToInt(it.get(i), 8388608.0, 23) } ?: (s!!.get(i).toInt() shl 8)
                    out.put((v and 0xFF).toByte()); out.put((v shr 8 and 0xFF).toByte()); out.put((v shr 16 and 0xFF).toByte())
                }
                AudioFormat.ENCODING_PCM_32BIT -> out.putInt(f?.let { floatToInt(it.get(i), 2147483648.0, 31) } ?: (s!!.get(i).toInt() shl 16))
            }
        }
        out.flip()
        val frames = samples / channels
        while (out.hasRemaining()) {
            if (pendingSeekUs >= 0 || pendingLoad != null) { out.clear(); return }
            if (!wantPlay) { sleep(100); continue } // jeda: simpan sisa data, lanjutkan saat diputar lagi
            if (t.playState != AudioTrack.PLAYSTATE_PLAYING) t.play()
            val w = t.write(out, out.remaining(), AudioTrack.WRITE_NON_BLOCKING)
            if (w < 0) error("AudioTrack menolak data ($w)")
            if (w == 0) sleep(10)
        }
        framesWritten += frames
    }

    /** Sampel float -> integer [bits]+1 bit; NaN/Inf (data rusak) menjadi hening alih-alih menghentikan pemutaran. */
    private fun floatToInt(x: Float, scale: Double, bits: Int): Int = if (x.isNaN()) 0 else clampInt((x.coerceIn(-1f, 1f) * scale).roundToLong(), bits)

    private fun clampInt(v: Long, bits: Int): Int {
        val max = (1L shl bits) - 1
        return v.coerceIn(-max - 1, max).toInt()
    }

    private fun bytesPerSample(enc: Int) = when (enc) {
        AudioFormat.ENCODING_PCM_16BIT -> 2
        AudioFormat.ENCODING_PCM_24BIT_PACKED -> 3
        else -> 4
    }

    private fun bitsOf(enc: Int) = when (enc) {
        AudioFormat.ENCODING_PCM_16BIT -> 16
        AudioFormat.ENCODING_PCM_24BIT_PACKED -> 24
        AudioFormat.ENCODING_PCM_32BIT -> 32
        AudioFormat.ENCODING_PCM_FLOAT -> 32
        else -> 0
    }

    private fun encodingName(enc: Int) = when (enc) {
        AudioFormat.ENCODING_PCM_16BIT -> "PCM 16-bit"
        AudioFormat.ENCODING_PCM_24BIT_PACKED -> "PCM 24-bit"
        AudioFormat.ENCODING_PCM_32BIT -> "PCM 32-bit"
        AudioFormat.ENCODING_PCM_FLOAT -> "PCM float"
        AudioFormat.ENCODING_PCM_8BIT -> "PCM 8-bit"
        else -> "encoding $enc"
    }

    // ---------------------------------------------------------------- posisi & event (thread utama)

    private fun playedFrames(): Long = runCatching { track?.let { it.playbackHeadPosition.toLong() and 0xFFFFFFFFL } }.getOrNull() ?: 0L

    private fun positionUs(): Long {
        val played = playedFrames()
        val seg = synchronized(segments) { segments.lastOrNull { it.startFrame <= played } } ?: return 0
        return seg.startUs + (played - seg.startFrame) * 1_000_000L / trackRate.coerceAtLeast(1)
    }

    private var lastSegmentStart = -1L

    private fun poll() {
        if (track == null) return
        val played = playedFrames()
        // lagu berikutnya (gapless) mulai terdengar: beri tahu halaman web
        synchronized(segments) {
            while (segments.size > 1 && segments[1].startFrame <= played) {
                segments.removeFirst()
                emit("gapless")
                emit("loadedmetadata", JSONObject().put("duration", segments.first().durationUs / 1e6))
            }
        }
        if (wantPlay) emit("timeupdate", JSONObject().put("time", positionUs() / 1e6))
    }

    private fun emit(type: String, data: JSONObject = JSONObject()) {
        main.post { emitter?.invoke(type, data) }
    }

    companion object {
        @Volatile private var instance: NativeEngine? = null
        fun get(context: Context): NativeEngine = instance ?: synchronized(this) { instance ?: NativeEngine(context).also { instance = it } }
    }
}
