package uk.everybodyhz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own plugin: alerts, background checks and notification taps.
        registerPlugin(GridAlertsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
