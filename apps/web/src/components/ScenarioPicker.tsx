import { buildScenario, SCENARIOS } from '@gridwatch/core';
import { IS_ARTIFACT } from '../platform/index.ts';
import { usePrefs } from '../state/prefs.tsx';
import { Icon } from './Icon.tsx';
import { Sheet } from './Sheet.tsx';

export function ScenarioPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, update } = usePrefs();
  return (
    <Sheet open={open} title="Preview a situation" onClose={onClose}>
      <p className="muted sheet-intro">
        See how {IS_ARTIFACT ? 'the app' : 'Mainsight'} responds. One is a replay of a real notice; the others are hypothetical.
      </p>
      <ul className="scenario-list">
        {SCENARIOS.map((s) => {
          const meta = buildScenario(s.id).scenario!;
          const selected = prefs.dataMode === 'scenario' && prefs.scenarioId === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`scenario ${selected ? 'is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  update({ dataMode: 'scenario', scenarioId: s.id });
                  onClose();
                }}
              >
                <span className="scenario-top">
                  <strong>{s.label}</strong>
                  <span className="chip">{meta.hypothetical ? 'Hypothetical' : 'Replay'}</span>
                </span>
                <span className="muted">{meta.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!IS_ARTIFACT && (
        <button
          type="button"
          className="btn scenario-live"
          onClick={() => {
            update({ dataMode: 'live' });
            onClose();
          }}
        >
          <Icon name="bolt" />
          Back to live data
        </button>
      )}
    </Sheet>
  );
}
