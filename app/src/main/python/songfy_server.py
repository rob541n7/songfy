"""
Songfy - server musicdl yang berjalan di dalam aplikasi Android (Python lewat Chaquopy).

Turunan dari server Alunan (musicdl-web/app.py). Dijalankan oleh songfy_main.start(),
hanya mendengarkan di 127.0.0.1 sehingga hanya bisa dibuka dari aplikasi Songfy sendiri.
"""
import copy
import hashlib
import hmac
import json
import secrets
import shutil
import socket
import re
import uuid
import mimetypes
import os
import sys
import threading
import time
from pathlib import Path

import requests
import urllib3
from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory, stream_with_context
from pathvalidate import sanitize_filename

# Konsol Windows sering memakai cp1252, sedangkan progress bar musicdl (rich) mencetak karakter
# seperti "⠋" yang tidak ada di cp1252 sehingga unduhan gagal. Paksa UTF-8 sebelum musicdl dimuat.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from musicdl import musicdl  # noqa: E402

urllib3.disable_warnings()

BASE_DIR = Path(os.environ["SONGFY_HOME"])  # penyimpanan internal aplikasi (data, cache)
WEB_DIR = Path(os.environ["SONGFY_WEB"])  # tampilan web yang disalin dari assets APK
LIBRARY_DIR = Path(os.environ.get("ALUNAN_LIBRARY", BASE_DIR / "library"))
CACHE_DIR = BASE_DIR / ".cache"
LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_EXTS = {".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".ape", ".wma", ".webm"}
MIME_BY_EXT = {"mp3": "audio/mpeg", "flac": "audio/flac", "m4a": "audio/mp4", "aac": "audio/aac", "ogg": "audio/ogg",
               "opus": "audio/ogg", "wav": "audio/wav", "webm": "audio/webm"}

# name, label, aktif secara default (yang paling cepat & stabil dari Indonesia saat diuji)
SOURCES = [
    ("YouTubeMusicClient", "YouTube Music", True),
    ("JooxMusicClient", "JOOX", True),
    ("QQMusicClient", "QQ Music", True),
    ("KuwoMusicClient", "Kuwo", True),
    ("SoundCloudMusicClient", "SoundCloud", False),
    ("KugouMusicClient", "Kugou", False),
    ("JioSaavnMusicClient", "JioSaavn", False),
    ("NeteaseMusicClient", "NetEase", False),
    ("MiguMusicClient", "Migu", False),
    ("QianqianMusicClient", "Qianqian", False),
    ("DeezerMusicClient", "Deezer", False),
    ("JamendoMusicClient", "Jamendo", False),
    ("BilibiliMusicClient", "Bilibili", False),
]
SOURCE_LABELS = {name: label for name, label, _ in SOURCES}
# sumber tambahan yang hanya dipakai untuk impor playlist dari URL
IMPORT_SOURCES = [name for name, _, _ in SOURCES] + ["SpotifyMusicClient", "StreetVoiceMusicClient", "FiveSingMusicClient"]
SOURCE_LABELS.update({"SpotifyMusicClient": "Spotify", "StreetVoiceMusicClient": "StreetVoice", "FiveSingMusicClient": "5SING"})

DATA_FILE = Path(os.environ.get("ALUNAN_DATA", BASE_DIR / "data" / "userdata.json"))
DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
EMPTY_DATA = {"likes": [], "playlists": [], "history": []}

# Akses dari HP/perangkat lain: server hanya mendengarkan di 127.0.0.1 kecuali ALUNAN_HOST=0.0.0.0,
# dan setiap perangkat selain komputer ini wajib memasukkan PIN.
HOST = os.environ.get("ALUNAN_HOST", "127.0.0.1")
PIN_FILE = BASE_DIR / "data" / "pin.txt"


def _load_pin() -> str:
    pin = os.environ.get("ALUNAN_PIN", "").strip()
    if pin:
        return pin
    if PIN_FILE.exists() and PIN_FILE.read_text(encoding="utf-8").strip():
        return PIN_FILE.read_text(encoding="utf-8").strip()
    pin = f"{secrets.randbelow(10 ** 6):06d}"
    PIN_FILE.write_text(pin, encoding="utf-8")
    return pin


ACCESS_PIN = _load_pin()
PIN_TOKEN = hashlib.sha256(f"alunan:{ACCESS_PIN}".encode()).hexdigest()
LOOPBACK = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
_failed_logins: dict = {}  # ip -> (jumlah gagal, waktu terakhir)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024


def _lan_addresses() -> list:
    ips = set()
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127.") and not ip.startswith("169.254."))


LOGIN_PAGE = """<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#121212"><title>Alunan · Masuk</title><link rel="icon" href="/static/icon.svg">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(#1f3d2a,#000 70%);color:#fff;font:16px "Segoe UI",system-ui,sans-serif;padding:16px}
form{width:min(360px,100%);text-align:center}img{width:64px;height:64px}h1{font-size:28px;margin:16px 0 6px}p{color:#b3b3b3;margin:0 0 24px;line-height:1.5}
input{width:100%;font-size:28px;letter-spacing:.4em;text-align:center;padding:14px;border-radius:8px;border:1px solid #535353;background:#121212;color:#fff;outline:none}
input:focus{border-color:#fff}button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:500px;background:#1ed760;color:#000;font-weight:700;font-size:16px}
.err{color:#f15e6c;margin-top:14px;min-height:20px}
</style></head><body><form method="post" action="/login"><img src="/static/icon.svg" alt=""><h1>Alunan</h1>
<p>Masukkan PIN yang tampil di jendela Alunan atau di menu Pengaturan pada komputer.</p>
<input name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="12" autofocus required>
<button>Masuk</button><div class="err">{error}</div></form></body></html>"""


def _same(a: str, b: str) -> bool:
    return hmac.compare_digest(str(a).encode("utf-8"), str(b).encode("utf-8"))


@app.before_request
def require_pin():
    if request.remote_addr in LOOPBACK or request.path == "/login" or request.path in {"/static/icon.svg", "/static/icon-192.png", "/static/icon-512.png", "/manifest.webmanifest", "/sw.js"}:
        return None
    if _same(request.cookies.get("alunan_auth", ""), PIN_TOKEN) or _same(request.headers.get("X-Alunan-Pin", ""), ACCESS_PIN):
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "PIN diperlukan"}), 401
    return Response(LOGIN_PAGE.replace("{error}", ""), status=401, mimetype="text/html")


@app.post("/login")
def login():
    ip = request.remote_addr
    count, last = _failed_logins.get(ip, (0, 0))
    if count >= 5 and time.time() - last < 60:
        return Response(LOGIN_PAGE.replace("{error}", "Terlalu banyak percobaan. Tunggu 1 menit."), status=429, mimetype="text/html")
    if _same(request.form.get("pin", "").strip(), ACCESS_PIN):
        _failed_logins.pop(ip, None)
        resp = Response(status=302, headers={"Location": "/"})
        resp.set_cookie("alunan_auth", PIN_TOKEN, max_age=365 * 24 * 3600, httponly=True, samesite="Lax")
        return resp
    _failed_logins[ip] = (count + 1, time.time())
    return Response(LOGIN_PAGE.replace("{error}", "PIN salah."), status=401, mimetype="text/html")


@app.get("/api/remote-info")
def remote_info():
    """Songfy berjalan di HP itu sendiri: tidak ada akses dari perangkat lain."""
    return jsonify({"enabled": False, "pin": None, "urls": []})

_clients: dict = {}
_clients_lock = threading.Lock()
_songs: dict = {}  # song id -> SongInfo (hasil pencarian, hilang saat server restart)
_jobs: dict = {}  # song id -> status unduhan
_jobs_lock = threading.Lock()
_imports: dict = {}  # import id -> status impor playlist
_quality_cache: dict = {}  # song id -> hasil membaca header audio
_data_lock = threading.Lock()


def get_client(source: str):
    with _clients_lock:
        if source not in _clients:
            cfg = {source: {"search_size_per_source": 6, "disable_print": True, "work_dir": str(CACHE_DIR / "search")}}
            _clients[source] = musicdl.MusicClient(music_sources=[source], init_music_clients_cfg=cfg)
        return _clients[source]


def clean(value):
    if value is None:
        return ""
    value = str(value).strip()
    return "" if value in {"NULL", "null", "None", "none"} else value


def song_id(song) -> str:
    key = f"{song.source}|{song.identifier}|{song.song_name}|{song.singers}"
    return hashlib.md5(key.encode("utf-8")).hexdigest()[:16]


def target_path(song) -> Path:
    name = sanitize_filename(f"{clean(song.singers) or 'Unknown'} - {clean(song.song_name) or 'Untitled'}")[:150]
    return LIBRARY_DIR / f"{name}.{(song.ext or 'mp3').removeprefix('.')}"


def _estimated_quality(song) -> dict:
    """Perkiraan kualitas dari data sumber (tanpa membaca file). Bit depth belum diketahui di tahap ini."""
    q = {"bits": None, "rate": song.samplerate or None, "channels": song.channels or None,
         "codec": clean(song.codec).lower() or None, "kbps": None, "estimated": True}
    if song.bitrate:
        q["kbps"] = int(song.bitrate / 1000) if song.bitrate > 10000 else int(song.bitrate)
    elif song.file_size_bytes and song.duration_s:
        q["kbps"] = int(song.file_size_bytes * 8 / song.duration_s / 1000)
    return q


def song_to_json(sid: str, song) -> dict:
    path = target_path(song)
    return {
        "q": _quality_cache.get(sid) or _estimated_quality(song),
        "id": sid,
        "title": clean(song.song_name) or "Tanpa judul",
        "artist": clean(song.singers) or "Tidak diketahui",
        "album": clean(song.album),
        "duration": song.duration_s or 0,
        "ext": clean(song.ext).lower(),
        "size": clean(song.file_size),
        "cover": clean(song.cover_url),
        "source": song.source,
        "sourceLabel": SOURCE_LABELS.get(song.source, song.source),
        "hasLyric": bool(clean(song.lyric)),
        "streamable": isinstance(song.download_url, str) and (song.protocol or "HTTP").upper() == "HTTP",
        "downloaded": path.exists(),
        "file": path.name if path.exists() else None,
    }


# ---------------------------------------------------------------- halaman

@app.get("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/static/<path:name>")
def static_files(name):
    return send_from_directory(WEB_DIR, name)


@app.get("/sw.js")
def service_worker():
    # harus disajikan dari root agar cakupannya seluruh aplikasi
    return send_from_directory(WEB_DIR, "sw.js", mimetype="text/javascript")


@app.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(WEB_DIR, "manifest.webmanifest", mimetype="application/manifest+json")


# ---------------------------------------------------------------- data pengguna (suka, playlist, riwayat)

@app.get("/api/userdata")
def get_userdata():
    with _data_lock:
        if not DATA_FILE.exists():
            return jsonify(EMPTY_DATA)
        data = json.loads(DATA_FILE.read_text(encoding="utf-8") or "{}")
    return jsonify({**EMPTY_DATA, **data})


@app.put("/api/userdata")
def put_userdata():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not all(isinstance(data.get(k), list) for k in EMPTY_DATA):
        abort(400)
    data = {k: data[k] for k in EMPTY_DATA}
    with _data_lock:
        tmp = DATA_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, DATA_FILE)
    return jsonify({"ok": True})


# ---------------------------------------------------------------- pencarian

@app.get("/api/sources")
def sources():
    return jsonify([{"name": n, "label": l, "default": d} for n, l, d in SOURCES])


@app.get("/api/search")
def search():
    keyword = request.args.get("q", "").strip()
    source = request.args.get("source", "")
    if not keyword or source not in SOURCE_LABELS:
        abort(400)
    started = time.time()
    try:
        results = get_client(source).search(keyword)
    except Exception as err:
        return jsonify({"source": source, "error": str(err), "songs": []})
    songs = []
    for song in results.get(source, []):
        sid = song_id(song)
        _songs[sid] = song
        songs.append(song_to_json(sid, song))
    return jsonify({"source": source, "songs": songs, "seconds": round(time.time() - started, 1)})


@app.get("/api/lyric/<sid>")
def lyric(sid):
    song = _songs.get(sid)
    return jsonify({"lyric": clean(song.lyric) if song else ""})


@app.get("/api/quality/<sid>")
def quality(sid):
    """Membaca header file audio di sumbernya (64 KB pertama) untuk mengetahui bit depth & sample rate asli."""
    if sid in _quality_cache:
        return jsonify(_quality_cache[sid])
    song = _songs.get(sid)
    if song is None:
        abort(404)
    local = target_path(song)
    q = None
    try:
        if local.exists():
            from mutagen import File as MFile
            q = _audio_quality(MFile(local))
        elif isinstance(song.download_url, str):
            headers = dict(song.default_download_headers or {})
            headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36")
            headers["Range"] = "bytes=0-65535"
            kwargs = dict(headers=headers, cookies=song.default_download_cookies or None, timeout=(10, 20), stream=True)
            try:
                resp = requests.get(song.download_url, **kwargs)
            except requests.exceptions.SSLError:
                resp = requests.get(song.download_url, verify=False, **kwargs)
            head = resp.raw.read(65536, decode_content=True) if resp.ok else b""
            resp.close()
            pos = head.find(b"fLaC")
            if pos >= 0:
                q = _flac_streaminfo(head[pos:])
            elif head:
                import io
                from mutagen import File as MFile
                audio = MFile(io.BytesIO(head))
                if audio is not None:
                    q = _audio_quality(audio)
    except Exception:
        q = None
    base = _estimated_quality(song)
    if q:
        # bitrate dari header file parsial tidak akurat untuk FLAC; pakai perkiraan ukuran/durasi
        q["kbps"] = base["kbps"] if q["codec"] in {"flac", "alac"} or not q["kbps"] else q["kbps"]
    else:
        q = base
    _quality_cache[sid] = q
    return jsonify(q)


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", " ", str(text or "").lower()).strip()


def _library_match(title: str, artist: str):
    stem = sanitize_filename(f"{artist or 'Unknown'} - {title or 'Untitled'}")[:150]
    for ext in AUDIO_EXTS:
        if (LIBRARY_DIR / f"{stem}{ext}").is_file():
            return f"{stem}{ext}"
    return None


@app.post("/api/resolve")
def resolve():
    """Mencari ulang lagu yang tersimpan (suka/playlist), karena tautan audio dari sumber cepat kedaluwarsa."""
    ref = request.get_json(silent=True) or {}
    sid, title, artist = ref.get("id"), ref.get("title", ""), ref.get("artist", "")
    if sid in _songs:
        return jsonify(song_to_json(sid, _songs[sid]))
    file = ref.get("file") if ref.get("file") and (LIBRARY_DIR / str(ref["file"])).is_file() else _library_match(title, artist)
    if file:
        return jsonify({"library": True, "file": file})
    source = ref.get("source")
    if source not in SOURCE_LABELS or not title:
        return jsonify({"error": "Data lagu tidak lengkap."}), 404
    try:
        found = get_client(source).search(f"{artist} {title}".strip()).get(source, [])
    except Exception as err:
        return jsonify({"error": str(err)}), 502
    if not found:
        return jsonify({"error": "Lagu tidak ditemukan lagi di sumbernya."}), 404

    def score(song):
        s, t, a = 0, _norm(song.song_name), _norm(song.singers)
        s += 4 if t == _norm(title) else 2 if _norm(title) in t or t in _norm(title) else 0
        s += 2 if _norm(artist) and _norm(artist) in a else 0
        if ref.get("duration") and song.duration_s:
            s += 1 if abs(int(ref["duration"]) - int(song.duration_s)) <= 5 else 0
        return s

    for song in found:
        _songs[song_id(song)] = song
    best = max(found, key=score)
    return jsonify(song_to_json(song_id(best), best))


def _run_import(jid: str, url: str):
    job = _imports[jid]
    for source in IMPORT_SOURCES:
        try:
            songs = get_client(source).parseplaylist(url)
        except Exception:
            continue
        if songs:
            items = []
            for song in songs:
                sid = song_id(song)
                _songs[sid] = song
                items.append(song_to_json(sid, song))
            job.update(status="done", source=SOURCE_LABELS.get(source, source), songs=items)
            return
    job.update(status="error", error="URL playlist tidak dikenali atau playlist kosong.")


@app.post("/api/import")
def import_playlist():
    url = str((request.get_json(silent=True) or {}).get("url", "")).strip()
    if not url.startswith("http"):
        return jsonify({"error": "Masukkan URL playlist yang valid."}), 400
    jid = uuid.uuid4().hex[:12]
    _imports[jid] = {"id": jid, "url": url, "status": "running", "started": time.time()}
    threading.Thread(target=_run_import, args=(jid, url), daemon=True).start()
    return jsonify(_imports[jid])


@app.get("/api/import/<jid>")
def import_status(jid):
    job = _imports.get(jid)
    if job is None:
        abort(404)
    return jsonify(job)


# ---------------------------------------------------------------- pemutaran

@app.get("/api/stream/<sid>")
def stream(sid):
    song = _songs.get(sid)
    if song is None:
        abort(404)
    local = target_path(song)
    if local.exists():
        return send_file(local, conditional=True)
    if not isinstance(song.download_url, str):
        abort(415)
    headers = dict(song.default_download_headers or {})
    headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36")
    if "Range" in request.headers:
        headers["Range"] = request.headers["Range"]
    kwargs = dict(headers=headers, cookies=song.default_download_cookies or None, stream=True, timeout=(10, 60))
    try:
        upstream = requests.get(song.download_url, **kwargs)
    except requests.exceptions.SSLError:
        upstream = requests.get(song.download_url, verify=False, **kwargs)
    except requests.RequestException:
        abort(502)
    if upstream.status_code >= 400:
        upstream.close()
        abort(502)
    ctype = upstream.headers.get("Content-Type", "")
    if not ctype.startswith("audio") and not ctype.startswith("video"):
        ctype = MIME_BY_EXT.get(clean(song.ext).lower(), "audio/mpeg")
    out = {"Content-Type": ctype, "Accept-Ranges": "bytes"}
    for h in ("Content-Length", "Content-Range"):
        if h in upstream.headers:
            out[h] = upstream.headers[h]
    body = stream_with_context(upstream.iter_content(chunk_size=64 * 1024))
    return Response(body, status=upstream.status_code, headers=out)


# ---------------------------------------------------------------- unduhan

def _run_download(sid: str, song):
    job = _jobs[sid]
    try:
        song = copy.deepcopy(song)
        path = target_path(song)
        song.work_dir = str(LIBRARY_DIR)
        song._save_path = str(path)
        job.update(status="downloading", path=str(path))
        done = get_client(song.source).download([song])
        # musicdl menyimpan catatan internal di folder unduhan; tidak berguna bagi pengguna
        (LIBRARY_DIR / "download_results.pkl").unlink(missing_ok=True)
        if done and path.exists():
            job.update(status="done", file=path.name)
        else:
            job.update(status="error", error="Sumber menolak unduhan atau tautan sudah kedaluwarsa.")
    except Exception as err:
        job.update(status="error", error=str(err))


@app.post("/api/download/<sid>")
def download(sid):
    song = _songs.get(sid)
    if song is None:
        return jsonify({"error": "Lagu tidak ditemukan, ulangi pencarian."}), 404
    with _jobs_lock:
        job = _jobs.get(sid)
        if job and job["status"] in {"queued", "downloading"}:
            return jsonify(job)
        info = song_to_json(sid, song)
        job = {"id": sid, "title": info["title"], "artist": info["artist"], "cover": info["cover"],
               "total": song.file_size_bytes or 0, "status": "queued", "started": time.time()}
        _jobs[sid] = job
    threading.Thread(target=_run_download, args=(sid, song), daemon=True).start()
    return jsonify(job)


@app.get("/api/downloads")
def downloads():
    out = []
    for job in sorted(_jobs.values(), key=lambda j: j["started"], reverse=True):
        item = dict(job)
        path = job.get("path")
        item["received"] = os.path.getsize(path) if path and os.path.exists(path) else 0
        item.pop("path", None)
        out.append(item)
    return jsonify(out)


# ---------------------------------------------------------------- pustaka (file yang sudah diunduh)

def _audio_quality(audio) -> dict:
    """Bit depth, sample rate, bitrate, dan codec dari objek mutagen."""
    info = audio.info
    codec = getattr(info, "codec", None) or type(audio).__name__.lower()
    if codec.startswith("mp4a"):
        codec = "aac"
    elif codec in {"easyid3mp3", "mp3", "easymp3"}:
        codec = "mp3"
    elif codec == "flac":
        codec = "flac"
    bitrate = getattr(info, "bitrate", 0) or 0
    return {"bits": getattr(info, "bits_per_sample", None) or getattr(info, "sample_size", None) or None,
            "rate": getattr(info, "sample_rate", None) or None, "channels": getattr(info, "channels", None) or None,
            "codec": codec, "kbps": int(bitrate / 1000) if bitrate else None, "estimated": False}


def _flac_streaminfo(head: bytes):
    """Membaca blok STREAMINFO FLAC (42 byte pertama) tanpa perlu seluruh file."""
    if len(head) < 42 or head[:4] != b"fLaC" or head[4] & 0x7F != 0:
        return None
    si = head[8:42]
    rate = (si[10] << 12) | (si[11] << 4) | (si[12] >> 4)
    channels = ((si[12] >> 1) & 0x07) + 1
    bits = (((si[12] & 0x01) << 4) | (si[13] >> 4)) + 1
    return {"bits": bits, "rate": rate, "channels": channels, "codec": "flac", "kbps": None, "estimated": False}


def _read_tags(path: Path) -> dict:
    info = {"title": path.stem, "artist": "", "album": "", "duration": 0, "q": None}
    if " - " in path.stem:
        info["artist"], info["title"] = path.stem.split(" - ", 1)
    try:
        from mutagen import File as MFile
        audio = MFile(path, easy=True)
        if audio is not None:
            info["q"] = _audio_quality(audio)
            if info["q"]["kbps"] is None and audio.info.length:
                info["q"]["kbps"] = int(path.stat().st_size * 8 / audio.info.length / 1000)
            info["duration"] = int(getattr(audio.info, "length", 0) or 0)
            tags = audio.tags or {}
            for key in ("title", "artist", "album"):
                if tags.get(key):
                    info[key] = tags[key][0]
    except Exception:
        pass
    return info


def _cover_bytes(path: Path):
    try:
        from mutagen import File as MFile
        audio = MFile(path)
        if audio is None:
            return None
        if getattr(audio, "pictures", None):
            pic = audio.pictures[0]
            return pic.data, pic.mime
        tags = audio.tags
        if tags is None:
            return None
        if hasattr(tags, "getall"):
            apic = tags.getall("APIC")
            if apic:
                return apic[0].data, apic[0].mime
        if "covr" in tags:
            data = bytes(tags["covr"][0])
            return data, "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
    except Exception:
        return None
    return None


def _library_file(name: str) -> Path:
    path = (LIBRARY_DIR / name).resolve()
    if path.parent != LIBRARY_DIR.resolve() or not path.is_file():
        abort(404)
    return path


@app.get("/api/library")
def library():
    items = []
    for path in sorted(LIBRARY_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if path.suffix.lower() not in AUDIO_EXTS:
            continue
        info = _read_tags(path)
        info.update(file=path.name, ext=path.suffix.lstrip(".").lower(),
                    size=f"{path.stat().st_size / 1024 / 1024:.1f} MB",
                    hasLyric=path.with_suffix(".lrc").exists(), added=path.stat().st_mtime)
        items.append(info)
    return jsonify({"folder": str(LIBRARY_DIR), "songs": items})


@app.post("/api/library/folder")
def library_folder():
    """Mengganti folder unduhan (dipilih di Pengaturan) dan, bila diminta, memindahkan lagu yang sudah ada."""
    global LIBRARY_DIR
    body = request.get_json(silent=True) or {}
    new_dir = Path(str(body.get("path", ""))).expanduser()
    if not new_dir.is_absolute():
        return jsonify({"error": "Folder tidak valid."}), 400
    try:
        new_dir.mkdir(parents=True, exist_ok=True)
        probe = new_dir / ".songfy-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as err:
        return jsonify({"error": f"Songfy tidak bisa menulis ke folder ini ({err.strerror or err})."}), 400
    moved, failed = 0, []
    old_dir = LIBRARY_DIR
    if body.get("move") and old_dir.resolve() != new_dir.resolve() and old_dir.exists():
        for path in list(old_dir.iterdir()):
            if path.suffix.lower() not in AUDIO_EXTS | {".lrc"}:
                continue
            target = new_dir / path.name
            if target.exists():
                failed.append(path.name)
                continue
            try:
                shutil.move(str(path), str(target))
                moved += path.suffix.lower() != ".lrc"
            except OSError:
                failed.append(path.name)
    LIBRARY_DIR = new_dir
    return jsonify({"folder": str(LIBRARY_DIR), "moved": moved, "failed": failed})


@app.post("/api/library/upload")
def library_upload():
    saved, skipped = [], []
    for item in request.files.getlist("files"):
        name = sanitize_filename(Path(item.filename or "").name)
        path = LIBRARY_DIR / name
        if not name or path.suffix.lower() not in AUDIO_EXTS:
            skipped.append(item.filename)
            continue
        n = 1
        while path.exists():
            path = LIBRARY_DIR / f"{Path(name).stem} ({n}){Path(name).suffix}"
            n += 1
        item.save(path)
        saved.append(path.name)
    return jsonify({"saved": saved, "skipped": skipped})


@app.get("/api/library/file/<path:name>")
def library_file(name):
    path = _library_file(name)
    return send_file(path, mimetype=mimetypes.guess_type(path.name)[0] or MIME_BY_EXT.get(path.suffix.lstrip(".").lower()), conditional=True)


@app.get("/api/library/cover/<path:name>")
def library_cover(name):
    cover = _cover_bytes(_library_file(name))
    if not cover:
        abort(404)
    data, mime = cover
    return Response(data, mimetype=mime or "image/jpeg", headers={"Cache-Control": "max-age=86400"})


@app.get("/api/library/lyric/<path:name>")
def library_lyric(name):
    lrc = _library_file(name).with_suffix(".lrc")
    return jsonify({"lyric": lrc.read_text(encoding="utf-8", errors="ignore") if lrc.exists() else ""})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5170))
    print(f"Alunan berjalan di http://localhost:{port}  (pustaka: {LIBRARY_DIR})")
    if HOST != "127.0.0.1":
        print("Akses dari HP (WiFi yang sama atau Tailscale):")
        for ip in _lan_addresses():
            print(f"   http://{ip}:{port}")
        print(f"PIN: {ACCESS_PIN}   (ubah dengan mengedit {PIN_FILE})")
    app.run(host=HOST, port=port, threaded=True, debug=False)
