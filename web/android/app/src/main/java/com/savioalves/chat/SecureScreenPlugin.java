package com.savioalves.chat;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Visualização única: enquanto a foto/vídeo/áudio está aberto, bloqueia print e gravação de tela
 * (a tela sai preta), como no WhatsApp. disable() libera de novo ao fechar.
 */
@CapacitorPlugin(name = "SecureScreen")
public class SecureScreenPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }
}
