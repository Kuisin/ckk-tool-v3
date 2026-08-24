package jp.co.ckk.kiosk

import android.Manifest
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.EditText
import android.widget.Toast
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.net.HttpURLConnection
import java.net.URL

/**
 * MainActivity — キオスク WebView シェル。
 *
 * - BuildConfig.BASE_URL（dev/prod フレーバー）のみ表示。外部ドメインへの
 *   ナビゲーションはブロック（リンクを踏んでも遷移しない）
 * - `window.KioskDevice`（KioskBridge）を注入 — 端末アテステーション用
 * - WebView 内 getUserMedia（QR スキャン）へカメラ権限をパススルー
 * - 画面常時 ON + イマーシブ（システムバー非表示）
 * - 戻るボタンは WebView 履歴内のみ（アプリは終了しない）
 *
 * デバイスオーナー時（QR プロビジョニング / adb dpm set-device-owner）は
 * KioskMode により Lock Task で端末をこのアプリに固定する。メンテナンスは
 * 画面**右上**を 5 回連続タップ → 管理者 PIN（BuildConfig.KIOSK_UNLOCK_PIN）。
 * ※ 左上は Web 側の隠し端末設定ジェスチャ（KioskShell のタイトル 5 タップ →
 *   /device-settings）が使うため右上にしている。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null

    // WebView geolocation（位置報告）の許可コールバック保留
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    // オフラインモード: メインフレームの読み込み失敗で表示し、
    // BASE_URL への疎通（LAN 内解決でも可 — インターネット到達性は見ない）が
    // 回復したら自動でアプリを再読み込みする
    private var offlineMode = false
    private val offlineHandler = Handler(Looper.getMainLooper())

    // メンテナンス退出ジェスチャ（右上 5 連続タップ）
    private var cornerTapCount = 0
    private var cornerTapFirstAt = 0L
    private var maintenanceDialogShowing = false

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingPermissionRequest
            pendingPermissionRequest = null
            if (request == null) return@registerForActivityResult
            if (granted) {
                request.grant(request.resources)
            } else {
                request.deny()
            }
        }

    private val requestLocation =
        registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions(),
        ) { grants ->
            val granted =
                grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                    grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
        }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // デバイスオーナーなら専用端末ポリシーを適用（それ以外は no-op）
        KioskMode.applyPolicies(this)

        // 自己更新: version.json をポーリング → 新版をサイレント適用
        SelfUpdater.schedule(this)

        // メンテナンス PIN の同期（毎日サーバー側で自動更新されるため）
        PinSync.schedule(this)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)

        // 許可ホスト = 公開 URL（BASE_URL）+ 社内 LAN URL（LAN_URL, *.ckk-tools.loc）。
        // キオスクは将来 LAN 限定にする方針で、その間はどちらのアドレスでも
        // 動く必要がある。LAN 側の証明書は社内 CA 発行 —
        // res/xml/network_security_config.xml でアンカーを同梱している。
        val allowedHosts = setOfNotNull(
            Uri.parse(BuildConfig.BASE_URL).host,
            Uri.parse(BuildConfig.LAN_URL).host,
        )
        // Uri.host は null になりうるので、判定は明示的に包む（null は常に不許可）。
        val isAllowedHost = { host: String? -> host != null && allowedHosts.contains(host) }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // ズーム無効（キオスク UI はタブレット前提のレイアウト）
            setSupportZoom(false)
            // 位置報告（LocationReporter — navigator.geolocation）
            setGeolocationEnabled(true)
        }
        webView.addJavascriptInterface(KioskBridge(), "KioskDevice")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // キオスクのホスト以外へは遷移させない
                return !isAllowedHost(request.url.host)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                // メインフレームの失敗のみオフライン扱い（画像等の失敗は無視）
                if (request.isForMainFrame) showOfflinePage()
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse,
            ) {
                // 502/503 等（リバースプロキシは生きていてアプリが落ちている場合）
                if (request.isForMainFrame && errorResponse.statusCode >= 500) {
                    showOfflinePage()
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                // 実ページの読み込み完了 = オンライン復帰（フォールバック自身は除外）
                if (!url.startsWith("data:") && !url.startsWith("about:")) {
                    offlineMode = false
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback,
            ) {
                // キオスクのオリジンのみ許可。実行時権限が無ければ要求してから応答
                if (!isAllowedHost(Uri.parse(origin).host)) {
                    callback.invoke(origin, false, false)
                    return
                }
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                    return
                }
                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                requestLocation.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ),
                )
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera =
                    request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                val fromKiosk = isAllowedHost(Uri.parse(request.origin.toString()).host)
                if (!wantsCamera || !fromKiosk) {
                    request.deny()
                    return
                }
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA,
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    request.grant(request.resources)
                } else {
                    pendingPermissionRequest = request
                    requestCamera.launch(Manifest.permission.CAMERA)
                }
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack()
                    // 履歴が無ければ何もしない（キオスクを閉じさせない）
                }
            },
        )

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.BASE_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    // ─── オフラインモード ───────────────────────────────────────────

    private fun showOfflinePage() {
        if (offlineMode) return
        offlineMode = true
        webView.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "utf-8", null)
        offlineHandler.postDelayed({ probeAndRecover() }, OFFLINE_RETRY_MS)
    }

    /** サーバー疎通を裏スレッドで確認し、回復していれば再読み込みする。 */
    private fun probeAndRecover() {
        if (!offlineMode) return
        Thread {
            val ok = probeServer()
            runOnUiThread {
                if (!offlineMode) return@runOnUiThread
                if (ok) {
                    offlineMode = false
                    webView.loadUrl(BuildConfig.BASE_URL)
                } else {
                    offlineHandler.postDelayed({ probeAndRecover() }, OFFLINE_RETRY_MS)
                }
            }
        }.start()
    }

    /** BASE_URL（/api/healthz）への到達確認。LAN 内の名前解決だけで成立する。 */
    private fun probeServer(): Boolean = try {
        val conn =
            URL("${BuildConfig.BASE_URL}/api/healthz").openConnection() as HttpURLConnection
        conn.connectTimeout = 4_000
        conn.readTimeout = 4_000
        val ok = conn.responseCode in 200..299
        conn.disconnect()
        ok
    } catch (_: Exception) {
        false
    }

    override fun onResume() {
        super.onResume()
        // メンテナンスから戻ったとき等に Lock Task とステータスバー無効を復元
        if (KioskMode.isDeviceOwner(this) && !maintenanceDialogShowing) {
            KioskMode.setStatusBarDisabled(this, true)
            if (lockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask()
            }
        }
        // オフライン中に画面復帰したら待たずに疎通確認
        if (offlineMode) probeAndRecover()
    }

    private fun lockTaskModeState(): Int =
        (getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).lockTaskModeState

    // ─── メンテナンス退出（右上 5 連続タップ → PIN） ───────────────
    // 左上は Web 側の隠し端末設定（KioskShell タイトル 5 タップ）と衝突するため右上

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) trackMaintenanceTap(ev)
        return super.dispatchTouchEvent(ev)
    }

    private fun trackMaintenanceTap(ev: MotionEvent) {
        if (!KioskMode.isDeviceOwner(this) || maintenanceDialogShowing) return
        val corner = resources.displayMetrics.density * 96 // 右上 96dp 四方
        val width = resources.displayMetrics.widthPixels.toFloat()
        if (ev.x < width - corner || ev.y > corner) {
            cornerTapCount = 0
            return
        }
        val now = SystemClock.elapsedRealtime()
        if (now - cornerTapFirstAt > 3_000) cornerTapCount = 0
        if (cornerTapCount == 0) cornerTapFirstAt = now
        cornerTapCount++
        if (cornerTapCount >= 5) {
            cornerTapCount = 0
            showMaintenanceDialog()
        }
    }

    private fun showMaintenanceDialog() {
        maintenanceDialogShowing = true
        PinSync.syncNow(this) // 最新 PIN を取得（毎日自動更新のため）
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "管理者 PIN"
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("メンテナンス")
            .setMessage("設定を開く: 一時的にロックを外して Android 設定へ\nキオスク解除: デバイスオーナーを解除（元に戻すには再プロビジョニング）")
            .setView(input)
            .setPositiveButton("設定を開く", null)
            .setNeutralButton("キオスク解除", null)
            .setNegativeButton("キャンセル", null)
            .create()
        dialog.setOnDismissListener { maintenanceDialogShowing = false }
        dialog.show()
        // PIN 不一致時に閉じないよう、show() 後にクリックリスナーを差し替える
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (!verifyPin(input)) return@setOnClickListener
            dialog.dismiss()
            stopLockTaskSafely()
            KioskMode.setStatusBarDisabled(this, false)
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            if (!verifyPin(input)) return@setOnClickListener
            dialog.dismiss()
            stopLockTaskSafely()
            KioskMode.clearDeviceOwner(this)
            Toast.makeText(this, "キオスクモードを解除しました", Toast.LENGTH_LONG).show()
        }
    }

    private fun verifyPin(input: EditText): Boolean {
        if (input.text.toString() == PinSync.current(this)) return true
        input.error = "PIN が違います"
        input.setText("")
        return false
    }

    private fun stopLockTaskSafely() {
        if (lockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) stopLockTask()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, webView).apply {
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}

private const val OFFLINE_RETRY_MS = 5_000L

// オフライン時のフォールバック画面（Web と同じ濃紺テーマ・日本語固定）
private val OFFLINE_HTML = """
<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         background:#121322; color:#c9cce3; font-family:'Noto Sans JP',sans-serif; }
  .wrap { text-align:center; padding:0 32px; }
  h1 { font-size:22px; margin:0 0 12px; color:#fff; }
  p { font-size:15px; line-height:1.8; margin:0 0 20px; color:#8f94b5; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%;
         background:#6d7394; margin:0 4px; animation:b 1.2s ease-in-out infinite; }
  .dot:nth-child(2){ animation-delay:.2s } .dot:nth-child(3){ animation-delay:.4s }
  @keyframes b { 0%,100%{ opacity:.25 } 50%{ opacity:1 } }
</style></head><body><div class="wrap">
<h1>サーバーに接続できません</h1>
<p>ネットワーク（Wi-Fi / LAN）を確認してください。<br>接続が回復すると自動的に再開します。</p>
<span class="dot"></span><span class="dot"></span><span class="dot"></span>
</div></body></html>
""".trimIndent()
