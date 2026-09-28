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
  { icon: 'clear', title: 'Plain English', text: 'What each official grid warning means for your home, and what to do.' },
  { icon: 'off', title: 'Your block, your times', text: 'Exact times if rotating power cuts are planned for your rota letter.' },
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
                <WelcomeRing />
                <h1 className="onboarding-title">{brand.tagline}</h1>
                <p className="muted onboarding-lede">
                  {brand.name} turns the grid operator’s official warnings into a clear answer for your home: all clear, heads-up, get
                  ready or power off.
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
                    Just look around
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
                <p className="muted onboarding-lede">We’ll never push routine notices unless you ask. You can change this any time.</p>
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

function WelcomeRing() {
  const C = 90;
  const polar = (r: number, m: number) => {
    const a = (m / 1440) * Math.PI * 2 - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  };
  const end = polar(62, 18 * 60);
  return (
    <div className="welcome-ring lvl-clear" aria-hidden="true">
      <div className="ring-glow" />
      <svg viewBox="0 0 180 180">
        {Array.from({ length: 48 }, (_, i) => {
          const [x0, y0] = polar(i % 12 === 0 ? 76 : 80, i * 30);
          const [x1, y1] = polar(85, i * 30);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className={i % 12 === 0 ? 'tick tick-major' : 'tick'} style={{ ['--i' as string]: i }} />;
        })}
        <circle cx={C} cy={C} r={62} className="ring-track" style={{ strokeWidth: 8 }} />
        <motion.path
          d={`M ${C} ${C - 62} A 62 62 0 1 1 ${end[0]} ${end[1]}`}
          className="welcome-arc"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
        />
        <motion.circle cx={end[0]} cy={end[1]} r={6} className="now-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.6, type: 'spring', stiffness: 400, damping: 16 }} />
      </svg>
    </div>
  );
}
