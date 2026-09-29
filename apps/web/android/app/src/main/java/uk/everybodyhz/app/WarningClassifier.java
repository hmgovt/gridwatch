package uk.everybodyhz.app;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads one NESO system warning (Elexon SYSWARN) for the background check.
 *
 * A port of classifyWarning, parseWindow and the alert rules in
 * packages/core/src/notices.ts and alerts.ts. The app itself uses the
 * TypeScript versions; apps/web/test/native-parity.test.ts checks that the
 * patterns here stay the same. Pure Java, no Android types, so it runs in
 * plain JVM unit tests.
 */
public final class WarningClassifier {

    public enum Kind { EMN, CMN, HRDR, DCI, DCRP }

    /** Lowest sensitivity that hears about each kind: 0 essential, 1 balanced, 2 everything. */
    static int minimumSensitivity(Kind kind) {
        switch (kind) {
            case DCI: return 0;
            case HRDR:
            case DCRP: return 1;
            default: return 2;
        }
    }

    static int sensitivityRank(String sensitivity) {
        if ("essential".equals(sensitivity)) return 0;
        if ("everything".equals(sensitivity)) return 2;
        return 1;
    }

    // Same order and patterns as KIND_PATTERNS in notices.ts: the most serious match wins.
    static final String DCRP_PATTERN = "DEMAND CONTROL ROTATION|\\bDCRP\\b|ROTA(?:TIONAL)?\\s+(?:LOAD\\s+)?DISCONNECTION";
    static final String DCI_PATTERN = "DEMAND CONTROL IMMINENT|\\bDCI\\b";
    static final String HRDR_PATTERN = "HIGH RISK OF DEMAND (?:REDUCTION|CONTROL)|\\bHRDR\\b";
    static final String CMN_PATTERN = "CAPACITY MARKET NOTICE|\\bCMN\\b";
    static final String EMN_PATTERN = "ELECTRICITY MARGIN NOTICE|\\bEMN\\b|INADEQUATE SYSTEM MARGIN|\\bNISM\\b";
    static final String CANCELLATION_PATTERN =
        "(?<!(?:MAY|WILL|COULD|MIGHT) BE )\\b(?:CANCELL?ED|CANCELL?ATION|WITHDRAWN|NO LONGER (?:IN FORCE|APPLIES|APPLICABLE))\\b";

    private static final Object[][] KINDS = {
        { Kind.DCRP, Pattern.compile(DCRP_PATTERN) },
        { Kind.DCI, Pattern.compile(DCI_PATTERN) },
        { Kind.HRDR, Pattern.compile(HRDR_PATTERN) },
        { Kind.CMN, Pattern.compile(CMN_PATTERN) },
        { Kind.EMN, Pattern.compile(EMN_PATTERN) },
    };
    private static final Pattern CANCELLATION = Pattern.compile(CANCELLATION_PATTERN);
    private static final Pattern WINDOW = Pattern.compile(
        "(?<![\\d/])([01]?\\d|2[0-3])[:.]?([0-5]\\d)\\s*(?:HRS|HOURS|H)?\\s*(?:TO|UNTIL|TILL|AND|-|–)\\s*([01]?\\d|2[0-4])[:.]?([0-5]\\d)\\s*(?:HRS|HOURS|H)?(?![\\d/])",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern DATE = Pattern.compile("(?<!\\d)(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})(?!\\d)");
    private static final TimeZone LONDON = TimeZone.getTimeZone("Europe/London");

    public static final class Result {
        public final Kind kind;
        public final boolean cancellation;
        /** "16:00–19:00", or null. */
        public final String window;
        /** "28/09/2026" as written, or null. */
        public final String date;

        Result(Kind kind, boolean cancellation, String window, String date) {
            this.kind = kind;
            this.cancellation = cancellation;
            this.window = window;
            this.date = date;
        }
    }

    public static final class Alert {
        public final String title;
        public final String body;
        public final boolean urgent;
        public final String path;

        Alert(String title, String body, boolean urgent, String path) {
            this.title = title;
            this.body = body;
            this.urgent = urgent;
            this.path = path;
        }
    }

    private WarningClassifier() {}

    /** The live feed mixes real line breaks with literal "\n" sequences. */
    static String clean(String text) {
        return text.replace("\\r", " ").replace("\\n", " ").replaceAll("\\s+", " ").trim();
    }

    /** Null when the message isn't one of the five notice kinds (trades, IT outages and so on). */
    public static Result classify(String warningType, String warningText) {
        String text = clean(warningText == null ? "" : warningText);
        String haystack = ((warningType == null ? "" : warningType) + " " + text).toUpperCase(Locale.UK);
        Kind kind = null;
        for (Object[] entry : KINDS) {
            if (((Pattern) entry[1]).matcher(haystack).find()) {
                kind = (Kind) entry[0];
                break;
            }
        }
        if (kind == null) return null;
        boolean cancellation = CANCELLATION.matcher(haystack).find();
        String window = null;
        Matcher w = WINDOW.matcher(text);
        if (w.find()) window = pad(w.group(1)) + ":" + w.group(2) + "–" + pad(w.group(3)) + ":" + w.group(4);
        String date = null;
        Matcher d = DATE.matcher(text);
        if (d.find()) date = pad(d.group(1)) + "/" + pad(d.group(2)) + "/" + d.group(3);
        return new Result(kind, cancellation, window, date);
    }

    /** The notification for a message, or null if this sensitivity doesn't hear about it. Mirrors alertFor in alerts.ts. */
    public static Alert alertFor(Result r, String sensitivity, long nowMillis, String noticePath) {
        if (sensitivityRank(sensitivity) < minimumSensitivity(r.kind)) return null;
        String when = describeWhen(r, nowMillis);
        String name = displayName(r.kind);
        if (r.cancellation) {
            return new Alert(
                "Stood down: " + name.toLowerCase(Locale.UK),
                "NESO has cancelled the " + officialName(r.kind) + (when.isEmpty() ? "." : " for " + when + "."),
                false,
                "/notices"
            );
        }
        switch (r.kind) {
            case DCI:
                return new Alert(
                    "Controlled cuts may start soon",
                    "NESO expects to reduce demand shortly. Charge phones now and check your rota block.",
                    true,
                    noticePath
                );
            case DCRP:
                return new Alert(
                    "Rotating power cuts announced",
                    "Open the app for your block's times, and check NESO's announcement.",
                    true,
                    "/"
                );
            case HRDR:
                return new Alert(
                    "Risk of controlled cuts" + (when.isEmpty() ? "" : " " + when),
                    "NESO warns it may need to reduce demand. Usually stood down. Charge phones and find your rota letter.",
                    false,
                    noticePath
                );
            default:
                return new Alert(
                    name + (when.isEmpty() ? "" : " " + when),
                    "A routine request for more generation. Not a warning of power cuts. Nothing to do.",
                    false,
                    noticePath
                );
        }
    }

    static String displayName(Kind kind) {
        switch (kind) {
            case EMN: return "Grid notice";
            case CMN: return "Capacity alert";
            case HRDR: return "Risk of controlled cuts";
            case DCI: return "Controlled cuts imminent";
            default: return "Rotating power cuts";
        }
    }

    static String officialName(Kind kind) {
        switch (kind) {
            case EMN: return "Electricity Margin Notice";
            case CMN: return "Capacity Market Notice";
            case HRDR: return "High Risk of Demand Reduction";
            case DCI: return "Demand Control Imminent";
            default: return "Demand Control Rotation Protocol";
        }
    }

    /** "today 16:00–19:00", "tomorrow 16:00–19:00", "29/09 16:00–19:00", or "16:00–19:00" with no date. */
    static String describeWhen(Result r, long nowMillis) {
        if (r.window == null) return "";
        if (r.date == null) return r.window;
        Calendar now = Calendar.getInstance(LONDON, Locale.UK);
        now.setTimeInMillis(nowMillis);
        String today = format(now);
        now.add(Calendar.DAY_OF_MONTH, 1);
        String tomorrow = format(now);
        if (r.date.equals(today)) return "today " + r.window;
        if (r.date.equals(tomorrow)) return "tomorrow " + r.window;
        return r.date.substring(0, 5) + " " + r.window;
    }

    private static String format(Calendar c) {
        return String.format(Locale.UK, "%02d/%02d/%04d", c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.MONTH) + 1, c.get(Calendar.YEAR));
    }

    private static String pad(String n) {
        return n.length() == 1 ? "0" + n : n;
    }
}
