package com.casamichele.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "CasaUpdater")
public class CasaUpdaterPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private static final long MAX_BYTES = 100L * 1024 * 1024;

    static boolean validReleaseUrl(String value) {
        return value != null && value.matches("https://github\\.com/mgritzbach/casa_michele/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+(-preview)?/CasaMichele-v[0-9]+\\.[0-9]+\\.[0-9]+(-preview)?\\.apk");
    }
    private static boolean trustedDownload(URL url) {
        String host = url.getHost();
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null && (url.getPort() == -1 || url.getPort() == 443)
            && (host.equals("github.com") || host.equals("release-assets.githubusercontent.com") || host.equals("objects.githubusercontent.com"));
    }
    static String checksum(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32768]; int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b & 255));
        return hex.toString();
    }
    @SuppressWarnings("deprecation")
    static void verifyArchive(Context context, File file, String expectedHash) throws Exception {
        if (!checksum(file).equalsIgnoreCase(expectedHash)) throw new IOException("Download verification failed. Please try again.");
        PackageManager manager = context.getPackageManager();
        PackageInfo update = manager.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo current = manager.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);
        if (update == null || !current.packageName.equals(update.packageName)) throw new IOException("This APK is not an update for this installation.");
        if (update.signatures == null || current.signatures == null || !Arrays.equals(update.signatures, current.signatures)) throw new IOException("The update uses a different signing key. Installation was stopped.");
        long next = Build.VERSION.SDK_INT >= 28 ? update.getLongVersionCode() : update.versionCode;
        long installed = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
        if (next <= installed) throw new IOException("This update is not newer than the installed app.");
    }
    static Intent installerIntent(Context context, File file) {
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        return new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }
    private void download(String address, File file) throws Exception {
        URL url = new URL(address);
        long deadline = System.currentTimeMillis() + 180000;
        for (int redirects = 0; redirects < 6; redirects++) {
            if (!trustedDownload(url)) throw new IOException("The update download redirected outside GitHub.");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "CasaMichele-Updater");
            try {
                int code = connection.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("GitHub returned an invalid download link.");
                    url = new URL(url, location); continue;
                }
                if (code != 200) throw new IOException("The update download failed. Please check your connection and try again.");
                if (connection.getContentLengthLong() > MAX_BYTES) throw new IOException("The update file is too large.");
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(file)) {
                    byte[] buffer = new byte[32768]; int read; long total = 0;
                    while ((read = input.read(buffer)) != -1) {
                        total += read;
                        if (total > MAX_BYTES || System.currentTimeMillis() > deadline) throw new IOException("The update download exceeded its limit. Please try again.");
                        output.write(buffer, 0, read);
                    }
                }
                return;
            } finally { connection.disconnect(); }
        }
        throw new IOException("The update download redirected too many times.");
    }
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url"), hash = call.getString("sha256");
        if (!validReleaseUrl(url) || hash == null || !hash.matches("[a-fA-F0-9]{64}")) { call.reject("The update must be a verified Casa Michele GitHub release."); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update is already being prepared."); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
                    JSObject result = new JSObject(); result.put("status", "permission"); call.resolve(result);
                } catch (Exception e) { call.reject("Open Android settings and allow Casa Michele to install updates."); }
                finally { busy.set(false); }
            });
            return;
        }
        worker.execute(() -> {
            File folder = new File(getContext().getCacheDir(), "updates");
            File file = new File(folder, "update.apk");
            try {
                if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Could not save the update. Free some storage and try again.");
                if (!file.isFile() || !checksum(file).equalsIgnoreCase(hash)) download(url, file);
                verifyArchive(getContext(), file, hash);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(installerIntent(getContext(), file));
                        JSObject result = new JSObject(); result.put("status", "installer"); call.resolve(result);
                    } catch (Exception e) { call.reject("Android could not open the installer. Please try again."); }
                    finally { busy.set(false); }
                });
            } catch (Exception e) {
                file.delete(); busy.set(false);
                call.reject(e instanceof IOException ? e.getMessage() : "Could not prepare the update. Check your connection and storage, then try again.");
            }
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
