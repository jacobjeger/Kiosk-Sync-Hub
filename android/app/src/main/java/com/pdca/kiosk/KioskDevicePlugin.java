package com.pdca.kiosk;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.UserManager;
import android.app.AlarmManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.LinkedList;

/**
 * The parts of a kiosk a web page cannot do.
 *
 * Two rules run through all of it.
 *
 * First, every privileged call is gated on being device owner and degrades
 * rather than throwing. The same APK has to run on a provisioned tablet, on one
 * whose provisioning failed, in an emulator, and in a browser preview — and a
 * tablet nobody could provision must still take payments. When a capability is
 * absent the method says so in its result, so the fleet page can show the
 * degraded state instead of the feature silently doing nothing.
 *
 * Second, identity lives in SharedPreferences rather than in the WebView. Local
 * storage belongs to the web layer: it is cleared by "clear cache" on some
 * OEMs, it is one config flip away from being wiped on a bundle swap, and it is
 * the same store the offline transaction queue depends on. SharedPreferences
 * survives bundle updates and APK upgrades, and on a device-owner tablet
 * clear-data is blocked outright.
 */
@CapacitorPlugin(name = "KioskDevice")
public class KioskDevicePlugin extends Plugin {

    private static final String TAG = "KioskDevice";

    /* The live plugin, so a push can reach the WebView.
       Static because FirebaseMessagingService is constructed by the framework
       and has no handle on the bridge. Null whenever the activity is gone,
       which is the case the push is there to fix — the service starts the
       activity too, and this only shortcuts the case where it was already up. */
    private static KioskDevicePlugin instance;

    /** Called from PdcaMessagingService. Safe when nothing is listening. */
    public static void notifyWake() {
        KioskDevicePlugin plugin = instance;
        if (plugin == null) return;
        try {
            plugin.notifyListeners("wake", new JSObject());
        } catch (Exception e) {
            Log.w(TAG, "Could not deliver wake: " + e.getMessage());
        }
    }
    private static final String PREFS = "pdca_kiosk_device";

    private static final String KEY_PUSH_TOKEN = "push_token";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_DEVICE_SECRET = "device_secret";
    private static final String KEY_ESCAPE_PIN = "escape_pin";
    private static final String KEY_EXECUTED = "executed_commands";

    /** How many command ids to remember. Enough to outlive any redelivery window. */
    private static final int EXECUTED_HISTORY = 50;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private DevicePolicyManager dpm() {
        return (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    private ComponentName admin() {
        return new ComponentName(getContext(), KioskDeviceAdminReceiver.class);
    }

    private boolean isOwner() {
        try {
            DevicePolicyManager dpm = dpm();
            return dpm != null && dpm.isDeviceOwnerApp(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }


    /** What the system says, not what we last asked for. */
    private boolean inLockTask() {
        try {
            android.app.ActivityManager am = (android.app.ActivityManager)
                    getContext().getSystemService(Context.ACTIVITY_SERVICE);
            return am != null
                    && am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE;
        } catch (Exception e) {
            return false;
        }
    }

    /** Absent capability, stated plainly. Never an exception — this is expected. */
    private void notOwner(PluginCall call) {
        JSObject out = new JSObject();
        out.put("ok", false);
        out.put("reason", "not_device_owner");
        call.resolve(out);
    }

    /* -----------------------------------------------------------------------
     * Identity
     * -------------------------------------------------------------------- */

    @PluginMethod
    public void getIdentity(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject out = new JSObject();
        out.put("deviceId", p.getString(KEY_DEVICE_ID, null));
        out.put("deviceSecret", p.getString(KEY_DEVICE_SECRET, null));
        out.put("escapePin", p.getString(KEY_ESCAPE_PIN, null));
        out.put("androidId", androidId());
        out.put("model", Build.MODEL);
        out.put("androidRelease", Build.VERSION.RELEASE);
        call.resolve(out);
    }

    @PluginMethod
    public void saveIdentity(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String secret = call.getString("deviceSecret");
        if (deviceId == null || secret == null) {
            call.reject("deviceId and deviceSecret are required");
            return;
        }
        SharedPreferences.Editor e = prefs().edit()
                .putString(KEY_DEVICE_ID, deviceId)
                .putString(KEY_DEVICE_SECRET, secret);
        String pin = call.getString("escapePin");
        if (pin != null) e.putString(KEY_ESCAPE_PIN, pin);
        // commit, not apply: enrollment happens once and losing it to a crash
        // before the write lands would mean re-enrolling the tablet by hand.
        e.commit();
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Update the escape PIN without touching the credential.
     *
     * Called on every check-in, so rotating a tablet's PIN from the portal
     * reaches it without anyone re-enrolling the device.
     */
    @PluginMethod
    public void setEscapePin(PluginCall call) {
        String pin = call.getString("escapePin");
        if (pin == null) {
            call.reject("escapePin is required");
            return;
        }
        prefs().edit().putString(KEY_ESCAPE_PIN, pin).commit();
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void clearIdentity(PluginCall call) {
        prefs().edit()
                .remove(KEY_DEVICE_ID)
                .remove(KEY_DEVICE_SECRET)
                .remove(KEY_ESCAPE_PIN)
                .commit();
        call.resolve(new JSObject().put("ok", true));
    }

    private String androidId() {
        try {
            return Settings.Secure.getString(
                    getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception e) {
            return null;
        }
    }

    /* -----------------------------------------------------------------------
     * State
     * -------------------------------------------------------------------- */

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("isDeviceOwner", isOwner());
        out.put("model", Build.MODEL);
        out.put("androidRelease", Build.VERSION.RELEASE);
        out.put("batteryPct", batteryPct());

        Activity activity = getActivity();
        boolean locked = false;
        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.app.ActivityManager am = (android.app.ActivityManager)
                    getContext().getSystemService(Context.ACTIVITY_SERVICE);
            locked = am != null
                    && am.getLockTaskModeState() != android.app.ActivityManager.LOCK_TASK_MODE_NONE;
        }
        out.put("inLockTask", locked);
        call.resolve(out);
    }

    private int batteryPct() {
        try {
            IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent status = getContext().registerReceiver(null, filter);
            if (status == null) return -1;
            int level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level < 0 || scale <= 0) return -1;
            return Math.round(level * 100f / scale);
        } catch (Exception e) {
            return -1;
        }
    }

    /* -----------------------------------------------------------------------
     * Kiosk policy
     * -------------------------------------------------------------------- */

    /**
     * Lock the tablet to this app.
     *
     * On a device owner this is real lock task, allowlisted for our own package.
     * Without ownership it falls back to screen pinning, which works but shows a
     * confirmation dialog and can be dismissed with back-and-recents. The result
     * says which of the two happened so the fleet page can tell them apart
     * rather than reporting a tablet as locked when it is merely pinned.
     */
    @PluginMethod
    public void startLockTask(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        try {
            if (isOwner()) {
                dpm().setLockTaskPackages(admin(), new String[]{getContext().getPackageName()});
            }
            activity.runOnUiThread(() -> {
                try {
                    activity.startLockTask();
                } catch (Exception e) {
                    Log.w(TAG, "startLockTask failed: " + e.getMessage());
                }
            });
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("mode", isOwner() ? "lock_task" : "pinning");
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not lock: " + e.getMessage());
        }
    }

    /**
     * Leave kiosk mode, if the caller knows this tablet's PIN.
     *
     * The PIN is checked here, against the copy in SharedPreferences, rather
     * than by the server. That is the whole point: the reason to unlock a
     * tablet is usually that it cannot reach the network, and a check that
     * needs the network would fail exactly when it is needed.
     *
     * The comparison is constant-time. A six-digit PIN is guessable in a
     * million tries by anyone holding the tablet, so this is not the thing
     * standing between an attacker and the device — but leaking it a digit at a
     * time through response timing would be a gift, and avoiding that is free.
     */
    @PluginMethod
    public void stopLockTask(PluginCall call) {
        String supplied = call.getString("pin");
        String expected = prefs().getString(KEY_ESCAPE_PIN, null);

        if (expected == null) {
            // No PIN was ever delivered, so there is nothing to check against.
            // Refusing would strand the tablet; this is only reachable before
            // enrollment, when it is not locked down yet either.
            Log.w(TAG, "No escape PIN on this device — unlocking without one");
        } else if (supplied == null || !constantTimeEquals(supplied, expected)) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "wrong_pin");
            call.resolve(out);
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        /* Run it and wait, rather than firing at the UI thread and reporting
           success regardless. This resolved ok:true even when the call threw,
           so the fleet page showed a tablet as unlocked while it was still
           locked -- the one thing this result is consulted for. */
        final boolean[] threw = {false};
        try {
            final java.util.concurrent.CountDownLatch done =
                    new java.util.concurrent.CountDownLatch(1);
            activity.runOnUiThread(() -> {
                try {
                    activity.stopLockTask();
                } catch (Exception e) {
                    threw[0] = true;
                    Log.w(TAG, "stopLockTask failed: " + e.getMessage());
                } finally {
                    done.countDown();
                }
            });
            done.await(3, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        // The status bar comes back with it. Leaving it disabled would mean
        // unlocking the app but still not reaching Wi-Fi settings, which is the
        // errand this exists for.
        if (isOwner()) {
            try {
                dpm().setStatusBarDisabled(admin(), false);
            } catch (Exception e) {
                Log.w(TAG, "Could not restore the status bar: " + e.getMessage());
            }
        }

        /* Ask the system what the state actually is, and clear the allowlist
           only once we are genuinely out. Clearing it while still locked is how
           this tablet ended up LOCKED with an empty mLockTaskPackages -- a state
           nothing on the device can then leave. */
        boolean stillLocked = inLockTask();
        if (!stillLocked && isOwner()) {
            try {
                dpm().setLockTaskPackages(admin(), new String[]{});
            } catch (Exception e) {
                Log.w(TAG, "Could not clear lock task packages: " + e.getMessage());
            }
        }

        JSObject out = new JSObject();
        out.put("ok", !stillLocked && !threw[0]);
        if (stillLocked) out.put("reason", "still_in_lock_task");
        call.resolve(out);
    }

    private static boolean constantTimeEquals(String a, String b) {
        byte[] left = a.getBytes();
        byte[] right = b.getBytes();
        if (left.length != right.length) return false;
        int diff = 0;
        for (int i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
        return diff == 0;
    }

    /**
     * Everything that makes the tablet a till rather than a tablet.
     *
     * Deliberately excludes DISALLOW_FACTORY_RESET. A tablet that cannot be
     * reset is a tablet that cannot be recovered when something goes wrong with
     * provisioning, and reset already requires physical access plus the device
     * PIN. The trade is not worth the corner it paints you into.
     */
    @PluginMethod
    public void setKioskPolicy(PluginCall call) {
        if (!isOwner()) {
            notOwner(call);
            return;
        }
        boolean enable = call.getBoolean("enable", true);
        JSObject applied = new JSObject();

        try {
            DevicePolicyManager dpm = dpm();
            ComponentName admin = admin();

            dpm.setLockTaskPackages(admin, enable
                    ? new String[]{getContext().getPackageName()}
                    : new String[]{});
            applied.put("lockTaskPackages", true);

            /* Be the home screen, so the till comes back on its own.

               The BOOT_COMPLETED receiver cannot do this alone: Android 10+
               refuses to let a background receiver start an activity, so after
               a power cut the tablet sat on the stock launcher until someone
               walked over. Pinning this as the persistent preferred activity
               also means no chooser and no way to change it from Settings --
               and pressing Home returns here rather than leaving the kiosk. */
            try {
                IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
                home.addCategory(Intent.CATEGORY_HOME);
                home.addCategory(Intent.CATEGORY_DEFAULT);
                if (enable) {
                    dpm.addPersistentPreferredActivity(admin, home,
                            new ComponentName(getContext(), MainActivity.class));
                } else {
                    // Clearing is by package, and only ours is ever set here.
                    dpm.clearPackagePersistentPreferredActivities(
                            admin, getContext().getPackageName());
                }
                applied.put("homeLauncher", true);
            } catch (Exception e) {
                Log.w(TAG, "Could not set the home activity: " + e.getMessage());
                applied.put("homeLauncher", false);
            }

            dpm.setStatusBarDisabled(admin, enable);
            applied.put("statusBar", true);

            dpm.setKeyguardDisabled(admin, enable);
            applied.put("keyguard", true);

            // Safe mode would boot straight past the kiosk. Adding a user would
            // give someone a second, unmanaged desktop on the same hardware.
            setRestriction(dpm, admin, UserManager.DISALLOW_SAFE_BOOT, enable);
            setRestriction(dpm, admin, UserManager.DISALLOW_ADD_USER, enable);
            applied.put("restrictions", true);

            // Wall-powered tills should not sleep behind a lock screen.
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                    enable ? String.valueOf(
                            BatteryManager.BATTERY_PLUGGED_AC
                                    | BatteryManager.BATTERY_PLUGGED_USB
                                    | BatteryManager.BATTERY_PLUGGED_WIRELESS) : "0");
            applied.put("stayAwake", true);

            // Home goes nowhere: the kiosk is the launcher.
            if (enable) {
                IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
                home.addCategory(Intent.CATEGORY_HOME);
                home.addCategory(Intent.CATEGORY_DEFAULT);
                dpm.addPersistentPreferredActivity(admin, home,
                        new ComponentName(getContext(), MainActivity.class));
            } else {
                dpm.clearPackagePersistentPreferredActivities(
                        admin, getContext().getPackageName());
            }
            applied.put("launcher", true);

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("applied", applied);
            call.resolve(out);
        } catch (Exception e) {
            Log.w(TAG, "setKioskPolicy failed: " + e.getMessage());
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage());
            out.put("applied", applied);
            call.resolve(out);
        }
    }

    private void setRestriction(DevicePolicyManager dpm, ComponentName admin,
                                String restriction, boolean enable) {
        try {
            if (enable) dpm.addUserRestriction(admin, restriction);
            else dpm.clearUserRestriction(admin, restriction);
        } catch (Exception e) {
            Log.w(TAG, "Restriction " + restriction + " not applied: " + e.getMessage());
        }
    }


    /* -----------------------------------------------------------------------
     * The device itself
     *
     * Everything here exists because lock task takes the alternatives away. A
     * tablet pinned to one app has no Settings, no quick tiles and no shade, so
     * anything an on-site person would normally reach for — join the new
     * router, turn the volume down, dim a screen in a dark room — has to arrive
     * from the office instead or not at all.
     * -------------------------------------------------------------------- */

    /**
     * Join a network.
     *
     * A canteen that changes its router would otherwise need every tablet
     * factory reset, because a locked device cannot be walked through Wi-Fi
     * setup by hand. `addNetwork` is deprecated for ordinary apps and returns
     * -1 for them on Android 10+, but a device owner is still permitted to call
     * it — which is exactly the case here and the reason this is not done with
     * suggestions, whose prompts a locked tablet cannot show anyone.
     */
    @PluginMethod
    public void addWifiNetwork(PluginCall call) {
        if (!isOwner()) { notOwner(call); return; }

        String ssid = call.getString("ssid", "");
        String password = call.getString("password", "");
        String security = call.getString("security", "wpa2");

        if (ssid == null || ssid.isEmpty()) {
            call.reject("An SSID is required");
            return;
        }

        try {
            WifiManager wifi = (WifiManager) getContext()
                    .getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) { call.reject("No Wi-Fi service"); return; }
            if (!wifi.isWifiEnabled()) wifi.setWifiEnabled(true);

            WifiConfiguration config = new WifiConfiguration();
            // Quoting is not cosmetic: the framework treats an unquoted SSID as
            // a hex-encoded one and the network silently never matches.
            config.SSID = "\"" + ssid + "\"";
            if ("open".equals(security)) {
                config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
            } else {
                config.preSharedKey = "\"" + password + "\"";
                config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);
            }

            int id = wifi.addNetwork(config);
            if (id == -1) {
                // Already known: update rather than duplicate, so a password
                // change reaches a tablet that already has the old one saved.
                for (WifiConfiguration existing : safeConfigs(wifi)) {
                    if (existing.SSID != null && existing.SSID.equals(config.SSID)) {
                        config.networkId = existing.networkId;
                        id = wifi.updateNetwork(config);
                        break;
                    }
                }
            }

            if (id == -1) {
                JSObject out = new JSObject();
                out.put("ok", false);
                out.put("reason", "refused_by_framework");
                call.resolve(out);
                return;
            }

            wifi.enableNetwork(id, false);   // false: do not drop the current link
            wifi.saveConfiguration();

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("networkId", id);
            out.put("ssid", ssid);
            call.resolve(out);
        } catch (Exception e) {
            Log.w(TAG, "addWifiNetwork failed: " + e.getMessage());
            call.reject("Could not add the network: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeWifiNetwork(PluginCall call) {
        if (!isOwner()) { notOwner(call); return; }
        String ssid = call.getString("ssid", "");
        if (ssid == null || ssid.isEmpty()) { call.reject("An SSID is required"); return; }

        try {
            WifiManager wifi = (WifiManager) getContext()
                    .getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) { call.reject("No Wi-Fi service"); return; }

            String quoted = "\"" + ssid + "\"";
            boolean removed = false;
            for (WifiConfiguration c : safeConfigs(wifi)) {
                if (c.SSID != null && c.SSID.equals(quoted)) {
                    removed = wifi.removeNetwork(c.networkId) || removed;
                }
            }
            if (removed) wifi.saveConfiguration();

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("removed", removed);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not remove the network: " + e.getMessage());
        }
    }

    /** Null rather than an exception when the caller may not enumerate. */
    private java.util.List<WifiConfiguration> safeConfigs(WifiManager wifi) {
        try {
            java.util.List<WifiConfiguration> list = wifi.getConfiguredNetworks();
            return list != null ? list : new java.util.ArrayList<WifiConfiguration>();
        } catch (Exception e) {
            return new java.util.ArrayList<WifiConfiguration>();
        }
    }

    /** Media volume, 0–100. A till that someone muted is a till with no beep. */
    @PluginMethod
    public void setVolume(PluginCall call) {
        Integer percent = call.getInt("percent");
        if (percent == null) { call.reject("percent is required"); return; }

        try {
            AudioManager audio = (AudioManager) getContext()
                    .getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) { call.reject("No audio service"); return; }

            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int want = Math.round(max * Math.max(0, Math.min(100, percent)) / 100f);
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, want, 0);

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("volume", want);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not set the volume: " + e.getMessage());
        }
    }

    /**
     * Screen brightness, 0–100.
     *
     * Writing SCREEN_BRIGHTNESS needs WRITE_SETTINGS, which an ordinary app has
     * to ask a human for — impossible on a locked tablet. A device owner grants
     * it to itself, so this works there and reports the gap everywhere else.
     */
    @PluginMethod
    public void setBrightness(PluginCall call) {
        Integer percent = call.getInt("percent");
        if (percent == null) { call.reject("percent is required"); return; }
        if (!isOwner()) { notOwner(call); return; }

        /* setSystemSetting, not Settings.System.putInt.
           WRITE_SETTINGS is an appop-gated special permission: declaring it in
           the manifest grants nothing, setPermissionGrantState does not cover
           it, and the only ways in are a human visiting Settings -- impossible
           on a locked till -- or adb. Verified on the tablet: granted=false.
           setSystemSetting is the device-owner route to the same values and
           needs no grant at all. */
        try {
            int value = Math.round(255 * Math.max(0, Math.min(100, percent)) / 100f);
            DevicePolicyManager dpm = dpm();
            ComponentName admin = admin();

            // Manual first: on automatic, the system overwrites whatever is set
            // here at the next light-sensor reading and the change looks like it
            // silently failed.
            dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS_MODE,
                    String.valueOf(Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL));
            dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS,
                    String.valueOf(value));

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("brightness", value);
            call.resolve(out);
        } catch (Exception e) {
            Log.w(TAG, "setBrightness failed: " + e.getMessage());
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage() == null ? "refused" : e.getMessage());
            call.resolve(out);
        }
    }

    /**
     * Hardware and OS restrictions.
     *
     * The one that matters is factory reset. A tablet somebody resets is a
     * tablet that loses its credential, its queued sales and its device-owner
     * status in one action, and the only way back is a physical re-provision.
     */
    @PluginMethod
    public void setRestrictions(PluginCall call) {
        if (!isOwner()) { notOwner(call); return; }

        try {
            DevicePolicyManager dpm = dpm();
            ComponentName admin = admin();

            if (call.getBoolean("blockFactoryReset") != null) {
                setRestriction(dpm, admin, UserManager.DISALLOW_FACTORY_RESET,
                        Boolean.TRUE.equals(call.getBoolean("blockFactoryReset")));
            }
            if (call.getBoolean("blockSafeBoot") != null) {
                setRestriction(dpm, admin, UserManager.DISALLOW_SAFE_BOOT,
                        Boolean.TRUE.equals(call.getBoolean("blockSafeBoot")));
            }
            if (call.getBoolean("blockUsbTransfer") != null) {
                setRestriction(dpm, admin, UserManager.DISALLOW_USB_FILE_TRANSFER,
                        Boolean.TRUE.equals(call.getBoolean("blockUsbTransfer")));
            }
            if (call.getBoolean("blockAddUser") != null) {
                setRestriction(dpm, admin, UserManager.DISALLOW_ADD_USER,
                        Boolean.TRUE.equals(call.getBoolean("blockAddUser")));
            }
            if (call.getBoolean("blockAppInstall") != null) {
                setRestriction(dpm, admin, UserManager.DISALLOW_INSTALL_APPS,
                        Boolean.TRUE.equals(call.getBoolean("blockAppInstall")));
            }

            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not apply restrictions: " + e.getMessage());
        }
    }

    /** A tablet on the wrong timezone stamps every sale wrong. */
    @PluginMethod
    public void setTimeZone(PluginCall call) {
        if (!isOwner()) { notOwner(call); return; }
        String tz = call.getString("timeZone", "");
        if (tz == null || tz.isEmpty()) { call.reject("timeZone is required"); return; }

        try {
            AlarmManager alarm = (AlarmManager) getContext()
                    .getSystemService(Context.ALARM_SERVICE);
            if (alarm == null) { call.reject("No alarm service"); return; }
            alarm.setTimeZone(tz);

            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("timeZone", tz);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not set the timezone: " + e.getMessage());
        }
    }


    /**
     * The push token, if one has been issued.
     *
     * Read from storage rather than fetched, because the fetch is asynchronous
     * and this is called on the check-in path — a token that is not there yet
     * arrives on the next beat, which is soon enough for something that only
     * matters once.
     */
    @PluginMethod
    public void getPushToken(PluginCall call) {
        SharedPreferences prefs = prefs();
        String token = prefs.getString(KEY_PUSH_TOKEN, null);

        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("token", token);
        call.resolve(out);
    }


    /**
     * What the radio thinks of this connection.
     *
     * The link half of a speed test, and the half that explains a slow one: a
     * tablet at -80 dBm on a congested 2.4 GHz channel is a placement problem,
     * not a bandwidth problem, and no amount of throughput measurement says so.
     * Reported alongside a timed download rather than instead of it, because
     * signal strength and usable speed disagree often enough to be worth
     * seeing together.
     */
    @PluginMethod
    public void getLinkInfo(PluginCall call) {
        try {
            WifiManager wifi = (WifiManager) getContext()
                    .getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) { call.reject("No Wi-Fi service"); return; }

            WifiInfo info = wifi.getConnectionInfo();
            JSObject out = new JSObject();
            out.put("ok", true);

            if (info == null || info.getNetworkId() == -1) {
                out.put("connected", false);
                call.resolve(out);
                return;
            }

            int rssi = info.getRssi();
            out.put("connected", true);
            // SSID arrives quoted from the framework; strip it so it matches
            // what a person typed and what the portal pushed.
            String ssid = info.getSSID();
            if (ssid != null) ssid = ssid.replaceAll("^\"|\"$", "");
            out.put("ssid", ssid);
            out.put("rssi", rssi);
            /* 0-4 bars, the same scale the status bar uses, so a number here
               means what somebody looking at the tablet would report. */
            out.put("bars", WifiManager.calculateSignalLevel(rssi, 5));
            out.put("linkSpeedMbps", info.getLinkSpeed());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                out.put("frequencyMhz", info.getFrequency());
                out.put("band", info.getFrequency() > 3000 ? "5GHz" : "2.4GHz");
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                out.put("rxLinkSpeedMbps", info.getRxLinkSpeedMbps());
                out.put("txLinkSpeedMbps", info.getTxLinkSpeedMbps());
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not read the link: " + e.getMessage());
        }
    }

    /* -----------------------------------------------------------------------
     * Commands
     * -------------------------------------------------------------------- */

    @PluginMethod
    public void reboot(PluginCall call) {
        if (!isOwner()) {
            notOwner(call);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "android_too_old");
            call.resolve(out);
            return;
        }
        try {
            // Resolve before rebooting: the caller is about to stop existing,
            // and a result delivered after that never reaches anyone.
            call.resolve(new JSObject().put("ok", true));
            dpm().reboot(admin());
        } catch (Exception e) {
            Log.w(TAG, "reboot refused: " + e.getMessage());
        }
    }

    /**
     * Remember that a command ran, before running it.
     *
     * A `reboot` interrupts the very report that would have said it happened,
     * so the tablet keeps its own record. Written with commit() rather than
     * apply() because the process is about to die and an asynchronous write
     * would not survive — which is the whole failure this guards against.
     */
    @PluginMethod
    public void markCommandExecuted(PluginCall call) {
        String id = call.getString("commandId");
        if (id == null) {
            call.reject("commandId is required");
            return;
        }
        LinkedList<String> seen = executed();
        if (!seen.contains(id)) {
            seen.addFirst(id);
            while (seen.size() > EXECUTED_HISTORY) seen.removeLast();
            prefs().edit().putString(KEY_EXECUTED, String.join(",", seen)).commit();
        }
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void wasCommandExecuted(PluginCall call) {
        String id = call.getString("commandId");
        call.resolve(new JSObject().put("executed", id != null && executed().contains(id)));
    }

    private LinkedList<String> executed() {
        LinkedList<String> out = new LinkedList<>();
        String raw = prefs().getString(KEY_EXECUTED, "");
        if (raw == null || raw.isEmpty()) return out;
        for (String part : raw.split(",")) {
            if (!part.isEmpty()) out.add(part);
        }
        return out;
    }

    /* -----------------------------------------------------------------------
     * Certificates
     * -------------------------------------------------------------------- */

    /**
     * Trust the network's CA before anything tries to use the network.
     *
     * These tablets sit behind a filter that re-signs TLS. Until its authority
     * is trusted the device cannot make an HTTPS request at all — which
     * includes the request that would have told it to trust the authority.
     * Chicken and egg, and the reason the certificate ships inside the APK
     * rather than being pushed: a tablet has to be able to bootstrap itself
     * from a factory reset with nothing but the installer.
     *
     * Run from load(), so it happens during bridge init and before the web
     * layer makes its first call.
     *
     * Worth being plain about what this costs. Trusting this CA means whoever
     * holds its key can read this device's traffic. That is already true of the
     * network these tablets are on and they cannot work without it; what
     * changes is that the tablet stops refusing to talk. It is installed only
     * when the app is device owner, so it is scoped to a device somebody
     * deliberately provisioned.
     */
    @Override
    public void load() {
        instance = this;
        super.load();
        try {
            if (!isOwner()) return;
            byte[] der = readBundledCa();
            if (der == null) return;
            if (dpm().hasCaCertInstalled(admin(), der)) return;
            boolean ok = dpm().installCaCert(admin(), der);
            Log.i(TAG, ok ? "Network CA installed" : "Network CA rejected by the platform");
        } catch (Exception e) {
            // Never fatal: a tablet that cannot install the CA is one that
            // cannot reach the server, which is visible everywhere else.
            Log.w(TAG, "Could not install the bundled CA: " + e.getMessage());
        }
    }

    private byte[] readBundledCa() {
        try (java.io.InputStream in =
                     getContext().getResources().openRawResource(R.raw.network_ca)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } catch (Exception e) {
            Log.w(TAG, "No bundled CA: " + e.getMessage());
            return null;
        }
    }

    /** Re-run the bundled install by hand, for a tablet provisioned out of order. */
    @PluginMethod
    public void installBundledCa(PluginCall call) {
        if (!isOwner()) {
            notOwner(call);
            return;
        }
        byte[] der = readBundledCa();
        if (der == null) {
            call.resolve(new JSObject().put("ok", false).put("reason", "no bundled certificate"));
            return;
        }
        try {
            JSObject out = new JSObject();
            if (dpm().hasCaCertInstalled(admin(), der)) {
                out.put("ok", true).put("already", true);
            } else {
                out.put("ok", dpm().installCaCert(admin(), der));
            }
            call.resolve(out);
        } catch (Exception e) {
            call.resolve(new JSObject().put("ok", false).put("reason", e.getMessage()));
        }
    }

    /**
     * Trust a certificate authority, fleet-wide.
     *
     * A device owner can install a CA without the user-facing prompt and
     * without a screen lock being set, which is the whole reason this exists:
     * these tablets sit on a filtered network that re-signs TLS, and until its
     * CA is trusted the tablet cannot reach the server at all — including to be
     * told to trust it. Chicken and egg, so it also has to work from a local
     * call, not only from a pushed command.
     *
     * Installing a CA means whoever holds its key can read this device's
     * traffic. That is already true of the network the tablet is on; what this
     * changes is that the tablet stops refusing to talk.
     */
    @PluginMethod
    public void installCaCert(PluginCall call) {
        if (!isOwner()) {
            notOwner(call);
            return;
        }
        String pem = call.getString("certificate");
        if (pem == null || pem.isEmpty()) {
            call.reject("certificate (PEM) is required");
            return;
        }
        try {
            /* PEM or bare base64 DER — the caller should not have to care, and
               the file on disk turned out to be DER the first time this ran. */
            byte[] der = android.util.Base64.decode(
                    pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", ""),
                    android.util.Base64.DEFAULT);

            if (dpm().hasCaCertInstalled(admin(), der)) {
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("already", true);
                call.resolve(out);
                return;
            }

            boolean installed = dpm().installCaCert(admin(), der);
            JSObject out = new JSObject();
            out.put("ok", installed);
            if (!installed) out.put("reason", "rejected by the platform");
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage());
            call.resolve(out);
        }
    }

    /* -----------------------------------------------------------------------
     * Getting out
     * -------------------------------------------------------------------- */

    /**
     * Release device ownership.
     *
     * Without this the only way off a provisioned tablet is a factory reset,
     * and there will be reasons to need one — retiring hardware, handing a
     * tablet back, replacing the package. Requires the escape PIN for the same
     * reason unlocking does: it is the check that works when nothing else can.
     */
    @PluginMethod
    public void unenroll(PluginCall call) {
        String supplied = call.getString("pin");
        String expected = prefs().getString(KEY_ESCAPE_PIN, null);
        if (expected != null && (supplied == null || !constantTimeEquals(supplied, expected))) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "wrong_pin");
            call.resolve(out);
            return;
        }

        if (!isOwner()) {
            notOwner(call);
            return;
        }

        try {
            setKioskPolicyOff();
            dpm().clearDeviceOwnerApp(getContext().getPackageName());
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage());
            call.resolve(out);
        }
    }

    /** Undo the restrictions before releasing ownership, or they outlive it. */
    private void setKioskPolicyOff() {
        try {
            DevicePolicyManager dpm = dpm();
            ComponentName admin = admin();
            dpm.setStatusBarDisabled(admin, false);
            dpm.setKeyguardDisabled(admin, false);
            setRestriction(dpm, admin, UserManager.DISALLOW_SAFE_BOOT, false);
            setRestriction(dpm, admin, UserManager.DISALLOW_ADD_USER, false);
            dpm.clearPackagePersistentPreferredActivities(admin, getContext().getPackageName());
            dpm.setLockTaskPackages(admin, new String[]{});
        } catch (Exception e) {
            Log.w(TAG, "Could not fully unwind kiosk policy: " + e.getMessage());
        }
    }
}
