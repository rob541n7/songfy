plugins {
    id("com.android.application")
    id("com.chaquo.python")
}

android {
    namespace = "com.rob.songfy"
    compileSdk {
        version = release(36) { minorApiLevel = 1 }
    }

    defaultConfig {
        applicationId = "com.rob.songfy"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        // Hampir semua HP Android modern memakai arm64; x86_64 untuk emulator
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    // Kunci tanda tangan pribadi tidak ikut di repo. Tanpa file ini build release
    // memakai kunci debug bawaan Android Studio.
    val liquidKey = rootProject.file("keystore/file-liquid.keystore")
    signingConfigs {
        if (liquidKey.exists()) create("liquid") {
            storeFile = liquidKey
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("liquid") ?: signingConfigs.getByName("debug")
        }
        debug {
            signingConfigs.findByName("liquid")?.let { signingConfig = it }
        }
    }
}

chaquopy {
    defaultConfig {
        version = "3.12"
        buildPython("C:/Users/Rob-PC/AppData/Local/Programs/Python/Python312/python.exe")
        pip {
            // Daftar lengkap (termasuk dependensi) dipasang tanpa resolusi otomatis: beberapa paket
            // native di repositori Chaquopy sedikit lebih tua dari batas versi yang diminta paket lain
            // (mis. pycryptodome 3.21 vs pywidevine >=3.23), padahal API yang dipakai musicdl sama.
            // Tidak tersedia di Android dan sengaja dilewati: av (PyAV), curl-cffi, nodejs-wheel;
            // orjson diganti modul Python murni (src/main/python/orjson.py).
            options("--no-deps")
            install("aigpy==2022.7.8.1")
            install("beautifulsoup4")
            install("bleach")
            install("blinker")
            install("brotli")
            install("certifi")
            install("cffi")
            // library C pendamping paket native Chaquopy (tidak ikut terpasang karena --no-deps)
            install("chaquopy-libffi")
            install("chaquopy-libxml2")
            install("chaquopy-libxslt")
            install("chaquopy-libyaml")
            install("charset-normalizer")
            install("click")
            install("colorama")
            install("construct==2.8.10")  // pymp4 butuh seri 2.8; 2.8.8 tidak punya paket wheel
            install("cryptography")
            install("emoji")
            install("fake-useragent")
            install("filetype")
            install("flask")
            install("idna")
            install("itsdangerous")
            install("jinja2")
            install("json-repair")
            install("lxml")
            install("m3u8")
            install("markdown-it-py")
            install("markupsafe")
            install("mdurl")
            install("mutagen")
            install("pathvalidate")
            install("platformdirs")
            install("prettytable")
            install("prompt-toolkit")
            install("protobuf")
            install("puremagic")
            install("pycparser")
            install("pycryptodome")
            install("pycryptodomex")
            install("pygments")
            install("pymp4")
            install("pywidevine")
            install("pyyaml")
            install("requests")
            install("rich")
            install("soupsieve")
            install("tabulate")
            install("tinytag")
            install("typing-extensions")
            install("unidecode")
            install("urllib3")
            install("wcwidth")
            install("webencodings")
            install("websocket-client")
            install("werkzeug")
            install("ytmusicapi")
        }
        // file data (bukan .py) di paket ini dibaca lewat path biasa, jadi diekstrak ke penyimpanan
        extractPackages("fake_useragent", "musicdl", "pywidevine", "certifi")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.media:media:1.7.0")
}
