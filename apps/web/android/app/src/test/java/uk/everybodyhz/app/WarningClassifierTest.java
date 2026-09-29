package uk.everybodyhz.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Real Elexon SYSWARN messages from 27-28 September 2026 (services/api/test/fixtures). */
public class WarningClassifierTest {

    // As delivered: literal "\\n" sequences mixed with real line breaks.
    static final String ISSUE = "From : Power System Manager – NESO Electricity Control Centre\r\\n\r\\nELECTRICITY MARGIN NOTICE \r\\n\r\\nAn ELECTRICITY MARGIN NOTICE has been issued by the National Energy System Operator to encourage market actions to increase System Margins.\r\\n \r\\nFor the period:\r\\nfrom 16:00 hrs to 19:00 hrs on Monday   28/09/2026  \r\\n             \r\\nThere is a reduced system margin. System margin shortfall 1400 MW\r\\n\r\\nThe current contingency requirement is 700 MW.\r\\n\r\\n1900 MW of generation is excluded from the available system margin due to system constraints.\r\\n\r\\nMaximum Generation Service may be instructed.\r\\n\r\\nTrading Points, Control Points and Externally interconnected System Operators are requested to notify National Energy System Operator of any additional MW capacity.\r\\n\r\\nSuppliers please advise National Energy System Operator of any additional Demand Control available.\r\\n\r\\nThe situation will be reviewed again by National Energy System Operator at 10:00 hours and an update issued.\r\\n\r\\nThis Notification of Issue of a GB Transmission System Warning - ELECTRICITY MARGIN NOTICE Issued at 00:30 hrs on 28/09/2026\r\\n\r\\nIssued by Power System Manager NESO Electricity Control Centre\r\\n\r\\n**************\r\\n\r\\nInformation Note:-\r\\nAs the System Operator, National Energy System Operator are responsible for balancing the electricity system in the final hours before real-time. We have a number of routine tools we can use to help us do this, this toolkit includes ELECTRICITY MARGIN NOTICES. An ELECTRICITY MARGIN NOTICE is used to send a signal to the electricity market. It highlights that, in the short-term, we would like a greater safety cushion (margin) between power demand and available supply. It does not signal that blackouts are imminent or that there is not enough generation to meet current demand.\r\\n";
    static final String CANCEL = "From : Power System Manager – NESO Electricity Control Centre\r\\n\r\\nNOTIFICATION CANCELLATION of GB TRANSMISSION SYSTEM WARNING \r\\n\r\\nThe GB Transmission System Warning\r\\n\r\\nELECTRICITY MARGIN NOTICE\r\\n\r\\nissued for the period from  16:00 hrs to 19:00 hrs on\r\\nMonday   28/09/2026 has been cancelled \r\\n\r\\nThe following GB Transmission System Warnings remain in force\r\\n \r\\nNone\r\\n \r\\n\r\\n\r\\nNotification Issued at 15:00 hrs on 28/09/2026\r\\nIssued by Power System Manager NESO Electricity Control Centre\r\\n";
    static final String TRADE = "NATIONAL ENERGY SYSTEM OPERATOR NOTIFICATION of excess energy prices used for settlement outside of BALIT for SO to SO Transactions\r\\nover the National Grid/RTE  Interconnector.\r\\n\r\\nPrices cover 23:00Hrs Today to 05:00Hrs Tomorrow (UK local time) and are in Euro/MWh.\r\\nFrom RTE: Offer 350.00; Bid 0.00 From NESO: Offer 701.21; Bid -210.36\r\\n\r\\nPrices cover 05:00Hrs Tomorrow to 19:00Hrs Tomorrow (UK local time) and are in Euro/MWh.\r\\nFrom RTE: Offer 350.00; Bid 0.00 From NESO: Offer 1168.68; Bid -210.36\r\\n\r\\nPrices cover 19:00Hrs Tomorrow to 23:00Hrs Tomorrow (UK local time) and are in Euro/MWh.\r\\nFrom RTE: Offer 350.00; Bid 0.00 From NESO: Offer 1168.68; Bid -210.36\r\\n\r\\n\r\\n";
    static final String IT_OUTAGE = "To All Balancing Mechanism Wider Access API EDL and EDT Users\r\\n\r\\nPlease be advised that there will be a planned outage impacting all WA API connected BMUs to the Balancing Mechanism from 09:00 to 23:00 on 01/10/2026.\r\\n\r\\nPlease note: this change does not impact Market Participants that have dedicated communication lines into the Balancing Mechanism. The Balancing Mechanism will be available throughout this outage for those Control Room users.\r\\n\r\\nFor any technical issues or incidents, please phone 0800 917 7111 or 0800 085 4806. Overseas callers should use +44 870 521 6121 and quote WA-API.\r\\n\r\\nAll Trading Points should notify their Control Points of this WA API outage to ensure that they are prepared to take telephone instructions or submit dynamic data changes to the ENCC.\r\\n\r\\nWA API Services Impacted during the Outage:\r\\n\r\\no       NESO_Health\r\\n\r\\no       NESO_Normalization\r\\n\r\\no       NESO_Instruction\r\\n\r\\no       NESO_Redeclaration\r\\n\r\\no       NESO_Submission\r\\n\r\\n\r\\nIssued by Power System Manager at 11:20 on 24/09/2026\r\\n";

    /** 12:20 BST on Monday 28 September 2026. */
    static final long NOON = 1790594400000L;

    @Test
    public void readsTheMarginNotice() {
        WarningClassifier.Result r = WarningClassifier.classify("ELECTRICITY MARGIN NOTICE", ISSUE);
        assertEquals(WarningClassifier.Kind.EMN, r.kind);
        assertEquals(false, r.cancellation);
        assertEquals("16:00–19:00", r.window);
        assertEquals("28/09/2026", r.date);
    }

    @Test
    public void readsItsCancellation() {
        WarningClassifier.Result r = WarningClassifier.classify("ELECTRICITY MARGIN NOTICE", CANCEL);
        assertEquals(WarningClassifier.Kind.EMN, r.kind);
        assertTrue(r.cancellation);
        assertEquals("16:00–19:00", r.window);
    }

    @Test
    public void ignoresRoutineMessages() {
        assertNull(WarningClassifier.classify("SO-SO TRADES", TRADE));
        assertNull(WarningClassifier.classify("IT SYSTEMS OUTAGE", IT_OUTAGE));
    }

    @Test
    public void marginNoticesOnlyReachPeopleWhoAskedForEverything() {
        WarningClassifier.Result r = WarningClassifier.classify("ELECTRICITY MARGIN NOTICE", ISSUE);
        assertNull(WarningClassifier.alertFor(r, "balanced", NOON, "/"));
        assertNull(WarningClassifier.alertFor(r, "essential", NOON, "/"));
        WarningClassifier.Alert alert = WarningClassifier.alertFor(r, "everything", NOON, "/notices/x");
        assertEquals("Grid notice today 16:00–19:00", alert.title);
        assertEquals("A routine request for more generation. Not a warning of power cuts. Nothing to do.", alert.body);
        assertEquals(false, alert.urgent);
    }

    @Test
    public void standDownNamesTheWindow() {
        WarningClassifier.Result r = WarningClassifier.classify("ELECTRICITY MARGIN NOTICE", CANCEL);
        WarningClassifier.Alert alert = WarningClassifier.alertFor(r, "everything", NOON, "/notices/x");
        assertEquals("Stood down: grid notice", alert.title);
        assertEquals("NESO has cancelled the Electricity Margin Notice for today 16:00–19:00.", alert.body);
    }

    @Test
    public void demandControlImminentIsUrgentForEveryone() {
        WarningClassifier.Result r = WarningClassifier.classify("DEMAND CONTROL IMMINENT", "DEMAND CONTROL IMMINENT warning issued for 17:00 to 19:00 hrs on 02/12/2026");
        assertEquals(WarningClassifier.Kind.DCI, r.kind);
        WarningClassifier.Alert alert = WarningClassifier.alertFor(r, "essential", NOON, "/notices/x");
        assertTrue(alert.urgent);
        assertEquals("02/12 17:00–19:00", WarningClassifier.describeWhen(r, NOON));
    }

    @Test
    public void mayBeCancelledIsNotACancellation() {
        WarningClassifier.Result r = WarningClassifier.classify("HIGH RISK OF DEMAND REDUCTION", "HIGH RISK OF DEMAND REDUCTION. This warning may be cancelled later.");
        assertEquals(WarningClassifier.Kind.HRDR, r.kind);
        assertEquals(false, r.cancellation);
    }
}
