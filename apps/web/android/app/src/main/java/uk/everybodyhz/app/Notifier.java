package uk.everybodyhz.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Posts alerts. Two channels, so people can silence routine notices and keep urgent ones loud. */
final class Notifier {

    static final String CHANNEL_URGENT = "urgent";
    static final String CHANNEL_NOTICES = "notices";
    static final String EXTRA_PATH = "uk.everybodyhz.app.PATH";

    private Notifier() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel urgent = new NotificationChannel(CHANNEL_URGENT, "Power cut warnings", NotificationManager.IMPORTANCE_HIGH);
        urgent.setDescription("Controlled or rotating power cuts are imminent or announced.");
        NotificationChannel notices = new NotificationChannel(CHANNEL_NOTICES, "Grid notices", NotificationManager.IMPORTANCE_DEFAULT);
        notices.setDescription("Heads-ups, routine grid notices and stand-downs.");
        manager.createNotificationChannel(urgent);
        manager.createNotificationChannel(notices);
    }

    static boolean allowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void show(Context context, int id, WarningClassifier.Alert alert) {
        if (!allowed(context)) return;
        ensureChannels(context);
        Intent open = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_PATH, alert.path);
        PendingIntent tap = PendingIntent.getActivity(
            context,
            id,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, alert.urgent ? CHANNEL_URGENT : CHANNEL_NOTICES)
            .setSmallIcon(R.drawable.ic_stat_hz)
            .setColor(0xFF2254D6)
            .setContentTitle(alert.title)
            .setContentText(alert.body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(alert.body))
            .setPriority(alert.urgent ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(alert.urgent ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException e) {
            // Permission withdrawn between the check and the post: nothing to do.
        }
    }
}
