# Songfy

Pemutar & pengunduh musik untuk Android dengan tampilan bergaya Spotify. Songfy menjalankan
[musicdl](https://github.com/CharlesPikachu/musicdl) (Python) **langsung di dalam HP** lewat
[Chaquopy](https://chaquo.com/chaquopy/), jadi tidak butuh komputer atau server.

## Unduh

Ambil `Songfy.apk` dari halaman [Releases](../../releases), lalu pasang di HP (Android 8.0 ke atas,
arm64 atau x86_64). Pembukaan pertama butuh ±30 detik untuk menyiapkan Python.

## Fitur

- Cari lagu dari beberapa sumber sekaligus (YouTube Music, JOOX, QQ Music, Kuwo, dan lainnya)
- Putar langsung (streaming) atau unduh ke HP, termasuk lirik tersinkron
- Label kualitas: Lossless / Hi-Res, bit depth, sample rate
- Lagu Disukai, playlist, impor playlist dari URL, riwayat putar
- Mesin audio native: gapless, equalizer 10 pita, dan **bit-perfect ke DAC USB** di Android 14+
- Notifikasi pemutar & kontrol layar kunci, tetap jalan saat layar mati
- Folder unduhan bisa dipilih (mis. `Music/Songfy`) agar terlihat di file manager dan aplikasi lain
- Mode layar penuh dengan lirik, tema warna, palet perintah

## Struktur

| Folder | Isi |
|---|---|
| `app/src/main/java/com/rob/songfy` | Aplikasi Android (Kotlin): WebView, mesin audio native, notifikasi |
| `app/src/main/python` | Server Songfy (Flask) dan salinan musicdl |
| `app/src/main/assets/web` | Tampilan (HTML/CSS/JavaScript) |

## Build

Butuh Android SDK, JDK 17+ (mis. JBR Android Studio) dan Python 3.12 di komputer build
(ubah path `buildPython` di `app/build.gradle.kts`).

```bash
./gradlew assembleRelease
```

## Lisensi & catatan

- musicdl dilisensikan **PolyForm Noncommercial 1.0.0** (lihat `MUSICDL-LICENSE.txt`), sehingga
  Songfy **hanya boleh dipakai untuk keperluan non-komersial**.
- Sebagian sumber musicdl memakai akun premium bersama atau API pihak ketiga. Hormati hak cipta
  dan ketentuan layanan masing-masing platform; gunakan atas tanggung jawab sendiri.
- Fitur yang butuh PyAV, curl_cffi atau Node.js (sebagian kecil fitur YouTube, TIDAL/Apple Music)
  tidak tersedia di Android.
