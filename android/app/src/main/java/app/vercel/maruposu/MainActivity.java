package app.vercel.maruposu;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Maraca POS for the tablet: the web till (offline-first, see src/lib/pos/client)
 * in a full-screen WebView, plus window.MaracaAndroid for printing ESC/POS to a
 * paired Bluetooth printer. Needs no Google Play services, Chrome or RawBT.
 * The page's data (IndexedDB outbox, service worker cache) is private to the app.
 */
public class MainActivity extends Activity {
    private static final int REQUEST_BLUETOOTH = 1;

    private WebView webView;
    private BluetoothPrinter printer;
    private final ExecutorService printQueue = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        printer = new BluetoothPrinter(this);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " MaracaPOS/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.addJavascriptInterface(new Bridge(), "MaracaAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new Client());
        setContentView(webView);
        hideSystemBars();
        registerBack();

        if (savedInstanceState == null || !restore(savedInstanceState)) webView.loadUrl(BuildConfig.START_URL);
    }

    private boolean restore(Bundle state) {
        return webView.restoreState(state) != null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Full screen; the bars come back with a swipe from the edge. */
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Back goes back in the page, never out of the till by accident. */
    private void registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
    }

    private void back() {
        if (webView.canGoBack()) webView.goBack();
        else moveTaskToBack(true);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        back();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        // The device session cookie must survive the app being killed
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        printQueue.shutdown();
        webView.destroy();
        super.onDestroy();
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void askBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQUEST_BLUETOOTH));
        }
    }

    private void printDone(String id, boolean ok, String error) {
        JSONObject detail = new JSONObject();
        try {
            detail.put("id", id).put("ok", ok);
            if (error != null) detail.put("error", error);
        } catch (JSONException ignored) {
            // keys and values are plain strings
        }
        String js = "window.dispatchEvent(new CustomEvent('maraca-print',{detail:" + detail + "}))";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    /** window.MaracaAndroid; see src/lib/pos/client/printer.ts. */
    private final class Bridge {
        @JavascriptInterface
        public String info() {
            try {
                return new JSONObject().put("app", "maruposu").put("version", BuildConfig.VERSION_NAME).toString();
            } catch (JSONException e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public String printers() {
            JSONObject r = new JSONObject();
            try {
                if (!hasBluetoothPermission()) {
                    askBluetoothPermission();
                    return r.put("ok", false).put("error", "Izinkan akses Bluetooth, lalu tekan Muat ulang").toString();
                }
                return r.put("ok", true).put("printers", printer.paired()).toString();
            } catch (Exception e) {
                try {
                    return r.put("ok", false).put("error", e.getMessage() == null ? "Bluetooth tidak tersedia" : e.getMessage()).toString();
                } catch (JSONException ignored) {
                    return "{\"ok\":false}";
                }
            }
        }

        @JavascriptInterface
        public void print(String id, String address, String base64) {
            if (!hasBluetoothPermission()) {
                askBluetoothPermission();
                printDone(id, false, "Izinkan akses Bluetooth dulu");
                return;
            }
            byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                printDone(id, false, "Data cetak rusak");
                return;
            }
            printQueue.execute(() -> {
                try {
                    printer.print(address, data);
                    printDone(id, true, null);
                } catch (Exception e) {
                    printDone(id, false, e.getMessage() == null ? "Gagal mencetak" : e.getMessage());
                }
            });
        }
    }

    /** The till stays in the app; anything else opens outside it. */
    private final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (("https".equals(uri.getScheme()) || BuildConfig.DEBUG) && BuildConfig.HOST.equals(uri.getHost())) return false;
            try {
                Intent intent = "intent".equals(uri.getScheme())
                    ? Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
            } catch (Exception ignored) {
                // nothing installed to open it
            }
            return true;
        }

        /** Debug builds only: a local HTTPS test server with a self-signed certificate. */
        @Override
        public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
            if (BuildConfig.DEBUG && "localhost".equals(BuildConfig.HOST)) handler.proceed();
            else handler.cancel();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            // Only when the till was never opened online on this tablet (otherwise the
            // service worker serves it offline)
            String html = "<html><body style=\"font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center\">"
                + "<div><h2>Maraca POS butuh internet sekali</h2><p>Sambungkan tablet ke internet untuk pertama kali membuka kasir.</p>"
                + "<button style=\"font-size:18px;padding:12px 24px\" onclick=\"location.href='" + BuildConfig.START_URL + "'\">Coba lagi</button></div></body></html>";
            view.loadDataWithBaseURL(BuildConfig.START_URL, html, "text/html", "utf-8", BuildConfig.START_URL);
        }
    }
}
