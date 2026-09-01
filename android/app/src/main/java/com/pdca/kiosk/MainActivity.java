package com.pdca.kiosk;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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

        /* The whole screen, not the part between the bars.
           Lock task hides the status bar but leaves its space, and the
           navigation bar keeps its strip at the bottom — a black band on a till
           that is meant to look like an appliance rather than a tablet running
           an app. Drawing edge to edge and hiding both reclaims it. */
        goFullScreen();

        // The till is wall-powered and meant to be readable across a counter, so
        // it should never sleep. Set here rather than by a native call from the
        // web layer because it must hold before the first render.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void goFullScreen() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            /* Sticky rather than plain immersive: a swipe from an edge shows the
               bars briefly and they leave again on their own. With the default
               behaviour the first stray swipe puts them back permanently, which
               on a kiosk means somebody has to notice and fix it. */
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    /* Reasserted on every return to the foreground. Coming back from a dialog,
       a reboot or a bundle swap otherwise lands with the bars restored. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullScreen();
    }
}
