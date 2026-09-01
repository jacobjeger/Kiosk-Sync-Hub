package com.pdca.kiosk;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate so the bridge sees it during init.
        // Capacitor 8 can auto-discover annotated plugins, but being explicit
        // means a missing plugin is a compile error rather than a method that
        // silently does not exist at runtime.
        registerPlugin(KioskDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
