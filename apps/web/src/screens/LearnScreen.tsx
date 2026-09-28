import { Callout105 } from '../components/Bits.tsx';
import { FlowDiagram } from '../components/FlowDiagram.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { LadderDiagram } from '../components/LadderDiagram.tsx';
import { useData } from '../data/DataProvider.tsx';
import { usePrefs } from '../state/prefs.tsx';

const CAN_WARN: Array<{ icon: IconName; what: string; when: string; how: string; status: 'yes' | 'soon' | 'no' }> = [
  {
    icon: 'off',
    what: 'Rotating power cuts',
    when: 'Hours ahead',
    how: 'NESO gives about 8 hours’ notice under the new rotation protocol. We match it to your rota letter.',
    status: 'yes',
  },
  {
    icon: 'bell',
    what: 'Grid notices',
    when: 'As soon as published',
    how: 'Often the night before. We explain each one and only alert you if it could affect you.',
    status: 'yes',
  },
  {
    icon: 'wave',
    what: 'Storm damage to local lines',
    when: 'Coming in 2027',
    how: 'We’re building local forecasts from weather and past faults, starting this winter.',
    status: 'soon',
  },
  {
    icon: 'bolt',
    what: 'Sudden faults',
    when: 'Can’t be predicted',
    how: 'A digger through a cable or equipment failing without warning. Call 105 if it happens.',
    status: 'no',
  },
];

export function LearnScreen() {
  const { status } = useData();
  const { prefs } = usePrefs();
  return (
    <div className="page learn">
      <header className="page-head">
        <span className="eyebrow">How it works</span>
        <h1>How Britain warns before the lights go out</h1>
        <p className="muted lede">
          NESO, which runs the electricity system for England, Scotland and Wales, publishes official warnings when spare capacity runs low.
          They follow a set ladder. Here’s what each step means for you.
        </p>
      </header>

      <section className="card" aria-labelledby="ladder-title">
        <div className="card-head">
          <h2 id="ladder-title">The warning ladder</h2>
        </div>
        <LadderDiagram current={status?.national ?? 0} />
      </section>

      <section className="card" aria-labelledby="flow-title-h">
        <div className="card-head">
          <h2 id="flow-title-h">Why notices happen on calm, dark evenings</h2>
        </div>
        <FlowDiagram />
      </section>

      <section className="card rota-explainer" aria-labelledby="rota-title">
        <div className="rota-copy">
          <h2 id="rota-title">Rotating power cuts and your rota letter</h2>
          <p>
            If there isn’t enough power for everyone, areas take turns to be switched off so the whole system doesn’t fail. Every home
            is in a rota block, shown by a letter on your electricity bill.
          </p>
          <p>
            Since August 2026, NESO can start rotations itself under the Demand Control Rotation Protocol. Reports say it gives about 8
            hours’ notice and keeps each block off for up to about 3 hours. Critical sites such as major hospitals are protected.
          </p>
          <p className="muted">Can’t find your letter? Your electricity supplier can tell you.</p>
        </div>
        <div className="bill" aria-label="Example of a rota letter on a bill">
          <span className="bill-head eyebrow">Your electricity bill</span>
          <span className="bill-line" />
          <span className="bill-line short" />
          <span className="bill-line" />
          <span className="bill-letter">
            <span className="muted">Rota letter</span>
            <strong>{prefs.rotaLetter ?? 'C'}</strong>
          </span>
          <span className="bill-line short" />
          <span className="bill-note">{prefs.rotaLetter ? 'Your letter' : 'Example'}</span>
        </div>
      </section>

      <section className="card" aria-labelledby="scope-title">
        <div className="card-head">
          <h2 id="scope-title">What we can and can’t warn you about</h2>
        </div>
        <ul className="scope">
          {CAN_WARN.map((row) => (
            <li key={row.what} className={`scope-row scope-${row.status}`}>
              <span className="scope-icon" aria-hidden="true">
                <Icon name={row.icon} />
              </span>
              <div className="scope-text">
                <strong>{row.what}</strong>
                <span className="muted">{row.how}</span>
              </div>
              <span className="chip scope-when">{row.when}</span>
            </li>
          ))}
        </ul>
      </section>

      <Callout105 />
    </div>
  );
}
