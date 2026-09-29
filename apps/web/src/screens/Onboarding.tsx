import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SENSITIVITIES, type Sensitivity } from '@gridwatch/core';
import { brand } from '../brand.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { LetterPicker } from '../components/LetterPicker.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { useToast } from '../components/Toast.tsx';
import { IS_ARTIFACT } from '../platform/index.ts';
import { useAlerts } from '../state/alerts.ts';
import { usePrefs } from '../state/prefs.tsx';
import { useUi } from '../state/ui.tsx';

const PROMISES: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'clear', title: 'Straight from the source', text: 'NESO’s own warnings and forecasts, explained. Nothing invented, nothing sensational.' },
  { icon: 'off', title: 'Your rota letter, ready', text: 'If rotating power cuts are ever announced, your block is the one that matters.' },
  { icon: 'lock', title: 'Private by design', text: 'No account, no location, no tracking. Your settings stay on this device.' },
];

export function Onboarding() {
  const { prefs, update } = usePrefs();
  const { closeWelcome } = useUi();
  const alerts = useAlerts();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const finish = () => {
    update({ onboarded: true });
    closeWelcome();
  };

  // A native modal dialog: focus moves inside, the page behind becomes inert, Escape skips.
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <motion.dialog
      ref={ref}
      className="onboarding"
      aria-label={`Welcome to ${brand.name}`}
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="onboarding-inner">
        <div className="onboarding-progress" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step}
            className="onboarding-step"
            custom={direction}
            initial={{ opacity: 0, x: 40 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 * direction }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {step === 0 && (
              <>
                <WelcomeMark />
                <h1 className="onboarding-title">{brand.tagline}</h1>
                <p className="muted onboarding-lede">
                  {brand.name} reads NESO’s official warnings as they’re published and tells you what they mean for your home: all
                  clear, heads-up, get ready or power off.
                </p>
                <ul className="promises">
                  {PROMISES.map((p, i) => (
                    <motion.li key={p.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.1 }}>
                      <span className="promise-icon">
                        <Icon name={p.icon} />
                      </span>
                      <span>
                        <strong>{p.title}</strong>
                        <span className="muted">{p.text}</span>
                      </span>
                    </motion.li>
                  ))}
                </ul>
                <div className="onboarding-actions">
                  <button type="button" className="btn btn-primary btn-wide" onClick={() => go(1)}>
                    Get started
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={finish}>
                    Look around first
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <span className="eyebrow">Step 1 of 2</span>
                <h1 className="onboarding-title">What’s your rota letter?</h1>
                <p className="muted onboarding-lede">
                  Every home is in a rota block, shown as a letter on your electricity bill. If rotating power cuts are ever needed, it
                  decides when you’re affected.
                </p>
                <LetterPicker value={prefs.rotaLetter} onChange={(rotaLetter) => update({ rotaLetter })} />
                <div className="onboarding-actions">
                  <button type="button" className="btn btn-primary btn-wide" onClick={() => go(2)}>
                    {prefs.rotaLetter ? `Continue with ${prefs.rotaLetter}` : 'Continue'}
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => go(0)}>
                    Back
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <span className="eyebrow">Step 2 of 2</span>
                <h1 className="onboarding-title">When should we tell you?</h1>
                <p className="muted onboarding-lede">Routine notices stay in the app unless you ask for them. You can change this any time.</p>
                <Segmented<Sensitivity>
                  label="Alert level"
                  stacked
                  value={prefs.sensitivity}
                  onChange={(sensitivity) => update({ sensitivity })}
                  options={(Object.keys(SENSITIVITIES) as Sensitivity[]).map((value) => ({
                    value,
                    label: SENSITIVITIES[value].label,
                    description: SENSITIVITIES[value].description,
                  }))}
                />
                {alerts.error && (
                  <p className="form-error" role="alert">
                    {alerts.error}
                  </p>
                )}
                {alerts.error && alerts.openSettings && (
                  <button type="button" className="btn" onClick={alerts.openSettings}>
                    Open notification settings
                  </button>
                )}
                <div className="onboarding-actions">
                  {!IS_ARTIFACT && alerts.support === 'supported' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-wide"
                      disabled={alerts.busy}
                      onClick={async () => {
                        if (await alerts.enable()) {
                          toast('Alerts are on');
                          finish();
                        }
                      }}
                    >
                      <Icon name="bell" />
                      {alerts.busy ? 'Turning on…' : 'Turn on alerts'}
                    </button>
                  ) : (
                    <p className="muted small-note">
                      {IS_ARTIFACT
                        ? 'Alerts aren’t available in this preview.'
                        : alerts.support === 'needs-install'
                          ? 'On iPhone, add the app to your Home Screen to get alerts.'
                          : 'This browser can’t receive alerts.'}
                    </p>
                  )}
                  <button type="button" className="btn btn-quiet" onClick={finish}>
                    {alerts.support === 'supported' && !IS_ARTIFACT ? 'Not now' : 'Finish'}
                  </button>
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </motion.dialog>
  );
}

/** The mark drawing itself: one cycle at 50 Hz, then the live dot. */
function WelcomeMark() {
  const steps = 64;
  const d = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return `${i === 0 ? 'M' : 'L'}${(24 + 192 * t).toFixed(1)},${(60 - 36 * Math.sin(t * Math.PI * 2)).toFixed(1)}`;
  }).join(' ');
  const [word, unit] = brand.name.split(' ');
  return (
    <div className="welcome-mark lvl-clear" aria-hidden="true">
      <div className="ring-glow" />
      <svg viewBox="0 0 240 120">
        <motion.line x1={10} y1={60} x2={230} y2={60} className="welcome-base" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
        <motion.path
          d={d}
          className="welcome-wave"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
        />
        <motion.circle cx={216} cy={60} r={7} className="welcome-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.5, type: 'spring', stiffness: 400, damping: 16 }} />
      </svg>
      <motion.p className="welcome-word" initial={{ opacity: 0, letterSpacing: '0.1em' }} animate={{ opacity: 1, letterSpacing: '0.32em' }} transition={{ delay: 0.5, duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}>
        {word}
        <span className="wordmark-unit">{unit}</span>
      </motion.p>
    </div>
  );
}
