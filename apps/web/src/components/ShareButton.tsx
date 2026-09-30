import { useState } from 'react';
import type { ShareCard } from '@gridwatch/core';
import { useData } from '../data/DataProvider.tsx';
import { shareCard } from '../share/share.ts';
import { Icon } from './Icon.tsx';
import { useToast } from './Toast.tsx';

/** Share a notice (or the current grid status) as an image and a short post. Hidden for preview scenarios. */
export function ShareButton({ card, label = 'Share' }: { card: () => ShareCard; label?: string }) {
  const { mode } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (mode === 'scenario') return null;
  return (
    <button
      type="button"
      className="btn btn-quiet share-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await shareCard(card());
          if (result === 'downloaded') toast('Image saved and text copied');
        } catch {
          toast('Couldn’t create the share card');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="share" />
      {busy ? 'Preparing…' : label}
    </button>
  );
}
