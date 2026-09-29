package uk.everybodyhz.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.TimeUnit;

/**
 * The bridge between the app and Android for alerts: permission, scheduling
 * the background check, a test notification, and opening the right screen
 * when a notification is tapped. The JavaScript side is apps/web/src/platform/native.ts.
 */
@CapacitorPlugin(
    name = "GridAlerts",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class GridAlertsPlugin extends Plugin {

    private static final String WORK_PERIODIC = "grid-check";
    private static final String WORK_NOW = "grid-check-now";

    @Override
    public void load() {
        Notifier.ensureChannels(getContext());
        deliverPath(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliverPath(intent);
    }

    /** Tell the app which screen a tapped notification points to. Retained until the app is listening. */
    private void deliverPath(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(Notifier.EXTRA_PATH);
        if (path == null || !path.startsWith("/")) return;
        intent.removeExtra(Notifier.EXTRA_PATH);
        JSObject data = new JSObject();
        data.put("path", path);
        notifyListeners("open", data, true);
    }

    // Before Android 13 there's no runtime permission: notifications are on unless the user turned them off.
    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            super.checkPermissions(call);
            return;
        }
        call.resolve(state(Notifier.allowed(getContext()) ? PermissionState.GRANTED : PermissionState.DENIED));
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permissionCallback");
            return;
        }
        checkPermissions(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(state(getPermissionState("notifications")));
    }

    private static JSObject state(PermissionState state) {
        JSObject result = new JSObject();
        result.put("notifications", state.toString());
        return result;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String sensitivity = call.getString("sensitivity", "balanced");
        if (!"essential".equals(sensitivity) && !"balanced".equals(sensitivity) && !"everything".equals(sensitivity)) {
            call.reject("Unknown sensitivity");
            return;
        }
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(AlertWorker.PREFS, Context.MODE_PRIVATE);
        boolean wasEnabled = prefs.getBoolean(AlertWorker.KEY_ENABLED, false);
        SharedPreferences.Editor edit = prefs.edit().putBoolean(AlertWorker.KEY_ENABLED, enabled).putString(AlertWorker.KEY_SENSITIVITY, sensitivity);
        // Start from now, so turning alerts on doesn't replay what's already happened.
        if (enabled && !wasEnabled) edit.putLong(AlertWorker.KEY_SINCE, System.currentTimeMillis());
        edit.apply();

        WorkManager work = WorkManager.getInstance(context);
        if (!enabled) {
            work.cancelUniqueWork(WORK_PERIODIC);
            call.resolve();
            return;
        }
        Constraints online = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(AlertWorker.class, 15, TimeUnit.MINUTES).setConstraints(online).build();
        work.enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic);
        work.enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, new OneTimeWorkRequest.Builder(AlertWorker.class).setConstraints(online).build());
        call.resolve();
    }

    @PluginMethod
    public void testAlert(PluginCall call) {
        if (!Notifier.allowed(getContext())) {
            call.reject("Notifications are turned off for everybody Hz in Android settings.");
            return;
        }
        Notifier.show(
            getContext(),
            1,
            new WarningClassifier.Alert(
                "Test alert",
                "Alerts work. The app checks NESO's warnings about every 15 minutes, and Android sometimes waits longer to save battery.",
                false,
                "/settings"
            )
        );
        call.resolve();
    }
}
