package com.savioalves.chat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio: número do aparelho no cadastro (Phone Number Hint do Google).
        registerPlugin(PhoneHintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
