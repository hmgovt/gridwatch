import { shareText, type ShareCard } from '@gridwatch/core';
import { brand } from '../brand.ts';
import { IS_NATIVE } from '../platform/index.ts';
import { renderCard } from './card.ts';

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Share a card: the image plus the same words we post to social media. On the
 * phone this opens the Android share sheet (WhatsApp, Messages and so on); in
 * a browser it uses the Web Share API where available, or downloads the image
 * and copies the text.
 */
export async function shareCard(card: ShareCard): Promise<ShareResult> {
  const text = shareText(card, brand.siteUrl);
  const image = await renderCard(card, brand.siteUrl);
  const fileName = 'everybody-hz.png';

  if (IS_NATIVE) {
    // Plugins stay inside this function: never return a Capacitor plugin from a promise (see alerts.ts).
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: fileName, data: await toBase64(image), directory: Directory.Cache });
    try {
      await Share.share({ title: card.headline, text, files: [written.uri], dialogTitle: 'Share' });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  const file = new File([image], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file], text })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  const url = URL.createObjectURL(image);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  return 'downloaded';
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
