package com.pdca.kiosk;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * What `dpm set-device-owner` binds to.
 *
 * Almost empty on purpose. Its existence is the requirement — device ownership
 * is granted to a component, not to a package — and the callbacks are here so
 * that a tablet losing or gaining ownership shows up in logcat rather than
 * being inferred from behaviour changing.
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {

    private static final String TAG = "KioskAdmin";

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.i(TAG, "Device admin enabled");
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        // Reached when ownership is released deliberately, through unenroll().
        // Any other route here means something removed it, and the fleet page
        // will show is_device_owner flipping to false on the next check-in.
        Log.w(TAG, "Device admin disabled — kiosk policy is no longer enforced");
    }

    @Override
    public void onLockTaskModeEntering(Context context, Intent intent, String pkg) {
        Log.i(TAG, "Lock task entered for " + pkg);
    }

    @Override
    public void onLockTaskModeExiting(Context context, Intent intent) {
        Log.i(TAG, "Lock task exited");
    }
}
