package com.savioalves.chat;

import android.app.NotificationManager;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio: número do aparelho no cadastro (Phone Number Hint do Google).
        registerPlugin(PhoneHintPlugin.class);
        // Plugin próprio: atualização do APK baixada do servidor.
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Abriu (sozinho ou pelo toque): some o aviso "Zynko atualizado".
        NotificationManager manager = ContextCompat.getSystemService(this, NotificationManager.class);
        if (manager != null) manager.cancel(UpdatedReceiver.NOTIFICATION_ID);
    }
}
