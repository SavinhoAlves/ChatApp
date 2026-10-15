package com.savioalves.chat;

import app.capgo.incomingcallkit.IncomingCallController;
import app.capgo.incomingcallkit.IncomingCallRecord;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import org.json.JSONObject;

/** Ligações chegando pelo FCM viram a tela de ligação da biblioteca; o resto segue para o Capacitor. */
public class CallPushService extends MessagingService {

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        String callId = data.get("callId");
        if ("call".equals(type) && callId != null) {
            boolean video = "1".equals(data.get("video"));
            JSONObject extra = new JSONObject();
            try {
                extra.put("video", video);
            } catch (Exception ignored) {}
            IncomingCallRecord call = new IncomingCallRecord(
                callId, data.get("callerName"), null, "Zynko", video, 45000,
                "Atender", "Recusar", "zynko_calls", "Ligações", true, "#14b8a6", null, true, extra, "ringing"
            );
            IncomingCallController.showIncomingCall(this, call, true);
        } else if ("call-end".equals(type) && callId != null) {
            IncomingCallController.endCall(this, callId, "ended");
        } else {
            super.onMessageReceived(message);
        }
    }
}
