package com.savioalves.chat;

import android.app.Activity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest;
import com.google.android.gms.auth.api.identity.Identity;

/**
 * "Phone Number Hint" do Google: mostra uma janelinha do sistema com o(s) número(s) do aparelho e devolve o
 * escolhido, sem pedir permissão de telefone. Nem todo chip/operadora informa o número: aí volta vazio.
 */
@CapacitorPlugin(name = "PhoneHint")
public class PhoneHintPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        // Registrado ao carregar o plugin (durante o onCreate da Activity), como o Android exige.
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pending;
            pending = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                resolve(call, "");
                return;
            }
            try {
                resolve(call, Identity.getSignInClient(getActivity()).getPhoneNumberFromIntent(result.getData()));
            } catch (Exception e) {
                resolve(call, "");
            }
        });
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (pending != null) {
            resolve(call, "");
            return;
        }
        GetPhoneNumberHintIntentRequest request = GetPhoneNumberHintIntentRequest.builder().build();
        Identity.getSignInClient(getActivity())
            .getPhoneNumberHintIntent(request)
            .addOnSuccessListener(pendingIntent -> {
                try {
                    pending = call;
                    launcher.launch(new IntentSenderRequest.Builder(pendingIntent.getIntentSender()).build());
                } catch (Exception e) {
                    pending = null;
                    resolve(call, "");
                }
            })
            .addOnFailureListener(e -> resolve(call, ""));
    }

    private void resolve(PluginCall call, String phone) {
        JSObject ret = new JSObject();
        ret.put("phone", phone == null ? "" : phone);
        call.resolve(ret);
    }
}
