"""
Titik masuk Python untuk aplikasi Android Songfy.

MainActivity memanggil start() di thread latar belakang. Fungsi ini menyiapkan folder,
lalu menjalankan server Flask di 127.0.0.1 sampai aplikasi ditutup. Kalau gagal, pesan
kesalahan lengkap ditulis ke startup-error.txt supaya bisa ditampilkan di layar.
"""
import os
import traceback
from pathlib import Path


def start(home: str, web: str, library: str, port: int) -> None:
    error_file = Path(home) / "startup-error.txt"
    try:
        error_file.unlink(missing_ok=True)
        Path(library).mkdir(parents=True, exist_ok=True)
        os.environ["SONGFY_HOME"] = home
        os.environ["SONGFY_WEB"] = web
        os.environ["ALUNAN_LIBRARY"] = library
        os.environ["ALUNAN_HOST"] = "127.0.0.1"
        import songfy_server
        # musicdl menulis log dan folder kerja relatif terhadap folder saat ini
        os.chdir(home)
        songfy_server.app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)
    except BaseException:
        error_file.write_text(traceback.format_exc(), encoding="utf-8")
        raise
