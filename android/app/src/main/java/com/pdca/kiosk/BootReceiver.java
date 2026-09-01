package com.pdca.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Bring the kiosk back after a restart.
 *
 * Belt and braces alongside setPersistentPreferredActivity, which makes the app
 * the home activity and is the better mechanism — Android 10 and later block
 * background activity starts for ordinary apps, and only device owners are
 * exempt. On an unprovisioned tablet this quietly does nothing, which is the
 * correct outcome rather than a crash.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "KioskBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            return;
        }

        try {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launch);
            Log.i(TAG, "Kiosk relaunched after boot");
        } catch (Exception e) {
            Log.w(TAG, "Could not relaunch after boot: " + e.getMessage());
        }
    }
}
