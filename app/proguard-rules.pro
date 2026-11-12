# Dipanggil dari JavaScript di WebView
-keepclassmembers class com.rob.songfy.WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.rob.songfy.SetupBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.rob.songfy.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.rob.songfy.StartBridge {
    @android.webkit.JavascriptInterface <methods>;
}
