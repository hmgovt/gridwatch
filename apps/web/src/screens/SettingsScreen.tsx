import { useState } from 'react';
import { SENSITIVITIES, type Sensitivity } from '@gridwatch/core';
import { brand } from '../brand.ts';
import { Icon } from '../components/Icon.tsx';
import { LetterPicker } from '../components/LetterPicker.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { useToast } from '../components/Toast.tsx';
import { useData } from '../data/DataProvider.tsx';
import { IS_ARTIFACT } from '../platform/index.ts';
import { useAlerts } from '../state/alerts.ts';
import { usePrefs, type ThemeChoice } from '../state/prefs.tsx';
import { useUi } from '../state/ui.tsx';

export function SettingsScreen() {
  const { prefs, update } = usePrefs();
  const { openScenarios, openWelcome } = useUi();
  const { mode, snapshot } = useData();

  return (
    <div className="page settings">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="muted">Everything here stays on this device unless you turn on alerts.</p>
      </header>

      <section className="card" aria-labelledby="letter-title">
        <div className="card-head">
          <h2 id="letter-title">Your rota letter</h2>
          {prefs.rotaLetter && <span className="chip mono">Block {prefs.rotaLetter}</span>}
        </div>
        <p className="muted card-lead">
          It’s printed on your electricity bill. We use it to tell you if and when your block is in a rotating power cut.
        </p>
        <LetterPicker value={prefs.rotaLetter} onChange={(rotaLetter) => update({ rotaLetter })} />
      </section>

      <AlertsCard />

      <section className="card" aria-labelledby="look-title">
        <div className="card-head">
          <h2 id="look-title">Appearance</h2>
        </div>
        <Segmented<ThemeChoice>
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: 'system', label: <><Icon name="system" /> System</> },
            { value: 'light', label: <><Icon name="sun" /> Light</> },
            { value: 'dark', label: <><Icon name="moon" /> Dark</> },
          ]}
        />
      </section>

      <section className="card" aria-labelledby="data-title">
        <div className="card-head">
          <h2 id="data-title">Data</h2>
          <span className="chip">{mode === 'scenario' ? 'Scenario' : 'Live'}</span>
        </div>
        <p className="muted card-lead">
          {mode === 'scenario'
            ? `You’re previewing “${snapshot?.scenario?.title ?? 'a scenario'}”.`
            : 'Live NESO warnings and forecasts, checked every two minutes.'}
        </p>
        <div className="button-row">
          <button type="button" className="btn" onClick={openScenarios}>
            <Icon name="layers" />
            Preview a situation
          </button>
          <button type="button" className="btn btn-quiet" onClick={openWelcome}>
            Replay the welcome
          </button>
        </div>
      </section>

      <PrivacyCard />

      <section className="card about" aria-labelledby="about-title">
        <div className="card-head">
          <h2 id="about-title">About {brand.name}</h2>
          <span className="chip mono">v0.1</span>
        </div>
        <p className="muted">
          {brand.name} is independent. It is not affiliated with NESO, National Grid, Elexon or any network operator. It explains
          official information; it doesn’t replace it.
        </p>
        <ul className="credits">
          <li>Contains BMRS data © Elexon Limited copyright and database right 2026.</li>
          <li>System warnings and forecasts are published by the National Energy System Operator (NESO).</li>
          <li>In a power cut, call 105 for your network operator.</li>
        </ul>
      </section>
    </div>
  );
}

function AlertsCard() {
  const { prefs, update } = usePrefs();
  const alerts = useAlerts();
  const toast = useToast();

  const blocked = alerts.support !== 'supported';
  const permissionDenied =
    alerts.kind === 'server' && !blocked && typeof Notification !== 'undefined' && Notification.permission === 'denied';

  return (
    <section className="card" aria-labelledby="alerts-title">
      <div className="card-head">
        <h2 id="alerts-title">Alerts</h2>
        <span className={`chip ${alerts.enabled ? 'chip-on' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {alerts.enabled ? 'On' : 'Off'}
        </span>
      </div>

      <Segmented<Sensitivity>
        label="How much you want to hear"
        stacked
        value={prefs.sensitivity}
        onChange={(sensitivity) => update({ sensitivity })}
        options={(Object.keys(SENSITIVITIES) as Sensitivity[]).map((value) => ({
          value,
          label: SENSITIVITIES[value].label,
          description: SENSITIVITIES[value].description,
        }))}
      />

      <div className="alerts-actions">
        {IS_ARTIFACT ? (
          <p className="muted">Alerts can’t be turned on in this preview. In the app, they arrive as notifications on your phone.</p>
        ) : alerts.support === 'needs-install' ? (
          <p className="muted">
            On iPhone and iPad, add {brand.name} to your Home Screen first (Share, then Add to Home Screen), then turn on alerts from there.
          </p>
        ) : alerts.support === 'unsupported' ? (
          <p className="muted">This browser can’t receive alerts. Try Chrome, Edge, Firefox or Safari.</p>
        ) : permissionDenied ? (
          <p className="muted">Notifications are blocked for this site. Allow them in your browser settings, then try again.</p>
        ) : alerts.enabled ? (
          <div className="button-row">
            <button
              type="button"
              className="btn"
              disabled={alerts.busy}
              onClick={async () => {
                const result = await alerts.test();
                if (result === 'sent') toast('Test alert sent');
              }}
            >
              <Icon name="bell" />
              Send a test alert
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={alerts.busy}
              onClick={async () => {
                await alerts.disable();
                toast('Alerts turned off');
              }}
            >
              Turn off
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked || alerts.busy}
            onClick={async () => {
              if (await alerts.enable()) toast('Alerts are on');
            }}
          >
            <Icon name="bell" />
            {alerts.busy ? 'Turning on…' : 'Turn on alerts'}
          </button>
        )}
        {alerts.error && (
          <p className="form-error" role="alert">
            {alerts.error}
          </p>
        )}
        {alerts.kind === 'device' && (
          <p className="muted small-note">
            Your phone checks NESO’s warnings about every 15 minutes, even with the app closed. Android sometimes waits longer to save
            battery, so treat an alert as a prompt, not a guarantee.
          </p>
        )}
      </div>
    </section>
  );
}

function PrivacyCard() {
  const { forgetEverything, alerts: registration } = usePrefs();
  const alerts = useAlerts();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="card privacy" aria-labelledby="privacy-title">
      <div className="card-head">
        <h2 id="privacy-title">Your privacy</h2>
        <Icon name="lock" />
      </div>
      <div className="privacy-grid">
        <div>
          <h3 className="eyebrow">On this device</h3>
          <ul>
            <li>Your rota letter</li>
            <li>Alert and theme choices</li>
            <li>The last grid status, for offline use</li>
          </ul>
        </div>
        {alerts.kind === 'device' ? (
          <div>
            <h3 className="eyebrow">Sent from this phone</h3>
            <ul>
              <li>Anonymous requests for Elexon’s public grid data, and nothing else</li>
              <li>Elexon sees your IP address, as any website would</li>
              <li>No server of ours is involved: alerts are checked on the phone</li>
            </ul>
          </div>
        ) : (
          <div>
            <h3 className="eyebrow">On our server, only with alerts on</h3>
            <ul>
              <li>A random push address from your browser</li>
              <li>Your rota letter and alert choice</li>
              <li>When the app was last opened (deleted after 6 months unused)</li>
            </ul>
          </div>
        )}
        <div>
          <h3 className="eyebrow">Never collected</h3>
          <ul>
            <li>Your name, email, phone number or address</li>
            <li>Your location</li>
            <li>Tracking, advertising or analytics cookies</li>
          </ul>
        </div>
      </div>

      {confirming ? (
        <div className="confirm">
          <p>
            Delete your settings from this device{registration && alerts.kind === 'server' ? ' and your alert registration from our server' : ''}? This
            can’t be undone.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (registration) await alerts.disable();
                forgetEverything();
                setConfirming(false);
                toast('Deleted. Nothing about you is stored.');
              }}
            >
              <Icon name="trash" />
              Yes, delete everything
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          <Icon name="trash" />
          Delete everything
        </button>
      )}
    </section>
  );
}
