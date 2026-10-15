package com.savioalves.chat;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Atualização do APK fora da Play Store: baixa a versão nova em segundo plano e abre o instalador do Android. */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private File apkFile(String version) {
        File dir = new File(getContext().getCacheDir(), "update");
        dir.mkdirs();
        return new File(dir, "Zynko-" + version + ".apk");
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (Exception e) {
            ret.put("version", "0.0.0");
        }
        call.resolve(ret);
    }

    /** Baixa (se ainda não baixou) a versão pedida. Resolve quando o arquivo está completo. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        long size = call.getLong("size", 0L);
        if (url == null || version == null) {
            call.reject("url e version são obrigatórios");
            return;
        }
        new Thread(() -> {
            File target = apkFile(version);
            try {
                if (!target.exists() || (size > 0 && target.length() != size)) {
                    File[] old = target.getParentFile().listFiles();
                    if (old != null) for (File f : old) f.delete();
                    File part = new File(target.getPath() + ".part");
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                    try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    if (size > 0 && part.length() != size) throw new Exception("Download incompleto");
                    if (!part.renameTo(target)) throw new Exception("Não foi possível salvar");
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    /** Abre o instalador do Android com a versão baixada (na 1ª vez pede para permitir instalar deste app). */
    @PluginMethod
    public void install(PluginCall call) {
        String version = call.getString("version");
        File file = version == null ? null : apkFile(version);
        if (file == null || !file.exists()) {
            call.reject("Versão não baixada");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve(new JSObject());
    }
}
