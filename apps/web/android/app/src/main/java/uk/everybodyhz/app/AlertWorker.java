package uk.everybodyhz.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.TreeSet;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The background check: every 15 minutes or so (Android decides exactly when),
 * fetch NESO's recent system warnings from Elexon and raise a notification for
 * each new one this person asked to hear about. Only a public, anonymous
 * request is made; nothing about the user leaves the device.
 */
public class AlertWorker extends Worker {

    static final String PREFS = "everybodyhz.alerts";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_SENSITIVITY = "sensitivity";
    static final String KEY_SINCE = "since";
    static final String KEY_SEEN = "seen";
    /** Notices we've alerted about and not yet seen cancelled: "KIND|date|firstPublishTime". */
    static final String KEY_OPEN = "open";
    /** For the Settings screen: when the check last ran, and what happened. */
    static final String KEY_LAST_CHECK = "lastCheck";
    static final String KEY_LAST_RESULT = "lastResult";

    private static final String BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets/SYSWARN";
    private static final long MINUTE = 60_000L;
    /** Messages older than this when first seen are recorded but not alerted (e.g. after the phone was off). */
    private static final long ALERTABLE_AGE = 120 * MINUTE;
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int MAX_SEEN = 300;
    /** Same as LINK_WINDOW_MS in notices.ts: later messages within this time belong to the same notice. */
    private static final long LINK_WINDOW = 36 * 60 * MINUTE;

    public AlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return Result.success();
        long now = System.currentTimeMillis();
        try {
            int notified = check(getApplicationContext(), prefs, now);
            record(prefs, now, notified == 0 ? "ok" : "notified " + notified);
            return Result.success();
        } catch (Exception e) {
            // Network trouble or an unexpected response: try again at the next run.
            record(prefs, now, "failed: " + e.getClass().getSimpleName());
            return Result.retry();
        }
    }

    private static void record(SharedPreferences prefs, long at, String result) {
        prefs.edit().putLong(KEY_LAST_CHECK, at).putString(KEY_LAST_RESULT, result).apply();
    }

    /** Returns how many notifications were posted. */
    static int check(Context context, SharedPreferences prefs, long now) throws Exception {
        int notified = 0;
        long since = Math.max(prefs.getLong(KEY_SINCE, now) - 10 * MINUTE, now - ALERTABLE_AGE);
        String url = BASE + "?publishDateTimeFrom=" + encode(iso(since)) + "&publishDateTimeTo=" + encode(iso(now + 5 * MINUTE)) + "&format=json";
        JSONArray data = new JSONObject(fetch(url)).getJSONArray("data");

        String sensitivity = prefs.getString(KEY_SENSITIVITY, "balanced");
        Set<String> seen = new TreeSet<>(prefs.getStringSet(KEY_SEEN, new HashSet<>()));
        Set<String> open = new HashSet<>();
        for (String entry : prefs.getStringSet(KEY_OPEN, new HashSet<>())) {
            String[] parts = entry.split("\\|", 3);
            if (parts.length == 3 && now - parseIso(parts[2]) < LINK_WINDOW) open.add(entry);
        }
        // Oldest first, so an issue is notified before its cancellation.
        for (int i = data.length() - 1; i >= 0; i--) {
            JSONObject row = data.optJSONObject(i);
            if (row == null) continue;
            String publishTime = row.optString("publishTime", "");
            String type = row.optString("warningType", "");
            String text = row.optString("warningText", "");
            String key = publishTime + "|" + type + "|" + text.length();
            if (publishTime.isEmpty() || seen.contains(key)) continue;
            seen.add(key);

            long published = parseIso(publishTime);
            if (published < 0 || now - published > ALERTABLE_AGE || published > now + 5 * MINUTE) continue;
            WarningClassifier.Result result = WarningClassifier.classify(type, text);
            if (result == null) continue;

            // Thread messages like buildNotices: same kind and date means the same notice.
            String prefix = result.kind.name() + "|" + result.date + "|";
            String existing = null;
            for (String entry : open) if (entry.startsWith(prefix)) existing = entry;
            if (result.cancellation) {
                // Only stand down what we told this person about.
                if (existing == null) continue;
                open.remove(existing);
            } else {
                if (existing != null) continue; // An update: the app shows it, but it isn't worth a notification.
                existing = prefix + publishTime;
                open.add(existing);
            }
            String firstPublished = existing.substring(prefix.length());
            String path = "/notices/" + result.kind.name().toLowerCase(Locale.UK) + "-" + firstPublished.replace("-", "").replace(":", "");
            WarningClassifier.Alert alert = WarningClassifier.alertFor(result, sensitivity, now, path);
            if (alert != null && Notifier.show(context, existing.hashCode(), alert)) notified++;
        }

        // Keep the newest keys only; ISO timestamps sort in time order.
        while (seen.size() > MAX_SEEN) seen.remove(((TreeSet<String>) seen).first());
        prefs.edit().putStringSet(KEY_SEEN, seen).putStringSet(KEY_OPEN, open).putLong(KEY_SINCE, now).apply();
        return notified;
    }

    private static String fetch(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        try {
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) throw new IllegalStateException("HTTP " + connection.getResponseCode());
            String type = connection.getContentType();
            if (type == null || !type.contains("json")) throw new IllegalStateException("Unexpected content type");
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[16 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    if (out.size() > MAX_BYTES) throw new IllegalStateException("Response too large");
                }
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            connection.disconnect();
        }
    }

    private static SimpleDateFormat isoFormat() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.UK);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    }

    static String iso(long millis) {
        return isoFormat().format(new Date(millis));
    }

    static long parseIso(String value) {
        try {
            Date d = isoFormat().parse(value);
            return d == null ? -1 : d.getTime();
        } catch (Exception e) {
            return -1;
        }
    }

    private static String encode(String s) throws Exception {
        return URLEncoder.encode(s, StandardCharsets.UTF_8.name());
    }
}
