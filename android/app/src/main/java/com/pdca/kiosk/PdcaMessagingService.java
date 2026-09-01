package com.pdca.kiosk;

import android.content.Intent;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Being told, rather than asking.
 *
 * The tablet polls once a minute, which is fine for telemetry and wrong for
 * anything a person is standing there waiting on: a lock, a reload, a message.
 * Worse, the poll is a timer inside the WebView, and Android suspends those
 * when the app is backgrounded or the screen sleeps — so a command issued to a
 * tablet nobody was touching did not arrive late, it did not arrive until
 * somebody opened the app.
 *
 * A high-priority data message wakes the process regardless. The payload is
 * deliberately empty of instructions: it says only "there is something for
 * you", and the tablet then fetches over its authenticated channel. A push that
 * carried the command itself would be a second, weaker path into the device —
 * unsigned, replayable, and trusted by nothing else in this system.
 */
public class PdcaMessagingService extends FirebaseMessagingService {

    private static final String TAG = "PdcaPush";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Log.i(TAG, "Wake received, checking in");

        /* Bring the kiosk forward. On a provisioned tablet this is what the
           screen should be showing anyway, and it is what restarts the WebView
           timers that Android suspended — starting the activity is the wake.
           FLAG_ACTIVITY_NEW_TASK is required from a service context; without
           SINGLE_TOP a wake would stack a second copy of the activity. */
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("wake", true);
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Could not bring the kiosk forward: " + e.getMessage());
        }

        // If the WebView is already alive, tell it directly so it beats now
        // rather than waiting out the rest of its interval.
        KioskDevicePlugin.notifyWake();
    }

    /**
     * The token changes on reinstall, on a data clear, and occasionally on its
     * own. Storing it rather than reporting it immediately is deliberate: this
     * can fire before the tablet has enrolled, when there is no credential to
     * report it with. The next check-in carries whatever is stored.
     */
    @Override
    public void onNewToken(String token) {
        Log.i(TAG, "Push token issued");
        getSharedPreferences("pdca_kiosk_device", MODE_PRIVATE)
                .edit()
                .putString("push_token", token)
                .apply();
    }
}
