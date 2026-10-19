package com.savioalves.chat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Depois de instalar uma atualização o Android encerra o app e não abre de novo. Aqui (já na versão nova)
 * o app se reabre sozinho. Alguns Android (10+) bloqueiam abrir tela em segundo plano: por isso também
 * fica a notificação "Zynko atualizado · toque para abrir", que some quando o app abre.
 */
public class UpdatedReceiver extends BroadcastReceiver {

    static final int NOTIFICATION_ID = 7001;
    private static final String CHANNEL_ID = "updates";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        notifyUpdated(context, open);
        try {
            context.startActivity(open);
        } catch (Exception ignored) {
            // Bloqueado pelo Android: fica a notificação.
        }
    }

    private void notifyUpdated(Context context, Intent open) {
        NotificationManager manager = ContextCompat.getSystemService(context, NotificationManager.class);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Atualizações do app", NotificationManager.IMPORTANCE_DEFAULT));
        }
        String version;
        try {
            version = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception e) {
            version = "";
        }
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            manager.notify(
                NOTIFICATION_ID,
                new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_chat)
                    .setColor(ContextCompat.getColor(context, R.color.notification_accent))
                    .setContentTitle(version.isEmpty() ? "Zynko atualizado" : "Zynko atualizado para a versão " + version)
                    .setContentText("Toque para abrir")
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .build()
            );
        } catch (SecurityException ignored) {
            // Sem permissão de notificação (Android 13+): só tenta abrir.
        }
    }
}
