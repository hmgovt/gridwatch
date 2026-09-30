import type { ShareCard, ShareTone } from '@gridwatch/core';
import { brand } from '../brand.ts';

/**
 * The share card: a 1080×1350 PNG (4:5, sits well in WhatsApp, Instagram and
 * most feeds). Always drawn on the night-blue brand background, whatever the
 * app theme, so shared cards look the same everywhere.
 */
const W = 1080;
const H = 1350;
const PAD = 84;

const C = {
  night: '#0a111d',
  sky: '#1b2a4b',
  ink: '#e7edf6',
  ink2: '#b4c0d2',
  ink3: '#8a98ae',
  line: '#223049',
};

const TONE: Record<ShareTone, string> = {
  calm: '#43c795',
  standdown: '#43c795',
  notice: '#86a8ff',
  warning: '#f0b43c',
  urgent: '#f25d6f',
};

const FONT = {
  display: '"Bricolage Grotesque", system-ui, sans-serif',
  body: '"Instrument Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

/** Draw the card and return it as a PNG. */
export async function renderCard(card: ShareCard, siteUrl: string, now: Date = new Date()): Promise<Blob> {
  await Promise.all(
    [`700 88px ${FONT.display}`, `600 40px ${FONT.display}`, `400 44px ${FONT.body}`, `600 44px ${FONT.body}`, `400 30px ${FONT.mono}`].map((f) =>
      document.fonts.load(f).catch(() => undefined),
    ),
  );
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device can’t draw the share card.');
  const tone = TONE[card.tone];

  // Background: night sky, lit from the top.
  const sky = ctx.createRadialGradient(W / 2, -200, 100, W / 2, -200, 1500);
  sky.addColorStop(0, C.sky);
  sky.addColorStop(0.7, C.night);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Wordmark with the mark.
  drawMark(ctx, PAD, 118, 60, tone);
  ctx.fillStyle = C.ink;
  ctx.font = `600 40px ${FONT.display}`;
  const word = brand.name.split(' ')[0] ?? brand.name;
  const endOfWord = spaced(ctx, word, PAD + 84, 132, 0.24);
  ctx.fillStyle = '#86a8ff';
  ctx.font = `700 40px ${FONT.display}`;
  ctx.fillText('Hz', endOfWord + 18, 132);

  // The 50 Hz line, in the notice's colour.
  drawWave(ctx, 0, 250, W, 34, tone, card.tone === 'standdown' || card.tone === 'calm' ? 0 : card.tone === 'notice' ? 0.12 : 0.3);

  let y = 400;
  // Eyebrow.
  ctx.font = `400 30px ${FONT.mono}`;
  ctx.fillStyle = tone;
  spaced(ctx, card.eyebrow.toUpperCase(), PAD, y, 0.08);
  y += 40;

  // Headline.
  ctx.fillStyle = C.ink;
  ctx.font = `700 88px ${FONT.display}`;
  y = wrap(ctx, card.headline, PAD, y + 88, W - PAD * 2, 96, 4);

  if (card.detail) {
    ctx.font = `400 34px ${FONT.mono}`;
    ctx.fillStyle = C.ink2;
    y = wrap(ctx, card.detail, PAD, y + 34, W - PAD * 2, 44, 2);
  }

  y += 40;
  ctx.font = `400 44px ${FONT.body}`;
  ctx.fillStyle = C.ink2;
  y = wrap(ctx, card.meaning, PAD, y + 44, W - PAD * 2, 60, 4);

  y += 24;
  ctx.font = `600 44px ${FONT.body}`;
  ctx.fillStyle = tone;
  wrap(ctx, card.action, PAD, y + 44, W - PAD * 2, 60, 3);

  // Footer: source, independence, where to look.
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, H - 232, W - PAD * 2, 2);
  ctx.font = `400 28px ${FONT.mono}`;
  ctx.fillStyle = C.ink3;
  ctx.fillText('Source: NESO via Elexon BMRS · not affiliated with NESO', PAD, H - 172);
  ctx.fillText(`Shared ${now.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`, PAD, H - 128);
  ctx.font = `400 34px ${FONT.mono}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(siteUrl.replace(/^https:\/\//, ''), PAD, H - 72);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));
}

/** Text with letter-spacing (in em), returning the x where it ends. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, em: number): number {
  const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 16);
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + size * em;
  }
  return cx - size * em;
}

/** Word-wrapped text; returns the baseline of the last line drawn. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number): number {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  let baseline = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, baseline);
      lines++;
      baseline += lineHeight;
      line = words[i]!;
      if (lines === maxLines - 1) {
        // Last allowed line: take the rest, trimmed with an ellipsis if needed.
        let rest = words.slice(i).join(' ');
        while (ctx.measureText(rest).width > width && rest.length > 1) rest = `${rest.slice(0, -2)}…`;
        ctx.fillText(rest, x, baseline);
        return baseline;
      }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, baseline);
  return baseline;
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, cy: number, size: number, dot: string) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#31415e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + size, cy);
  ctx.stroke();
  ctx.strokeStyle = '#86a8ff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const px = x + 4 + (size - 12) * t;
    const py = cy - size * 0.26 * Math.sin(t * Math.PI * 2);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(x + size - 8, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The brand wave: a faint 50 Hz reference and the live line, unsettled by `wobble`. */
function drawWave(ctx: CanvasRenderingContext2D, x0: number, cy: number, width: number, amp: number, color: string, wobble: number) {
  const lambda = width / 5;
  const path = (fn: (x: number) => number) => {
    ctx.beginPath();
    for (let x = x0; x <= x0 + width; x += 4) {
      const y = cy - amp * fn(x);
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(138,152,174,0.28)';
  ctx.lineWidth = 2;
  path((x) => Math.sin((x / lambda) * Math.PI * 2));
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  path((x) => {
    const p = (x / (lambda * 1.08)) * Math.PI * 2;
    return Math.sin(p) * (1 - wobble * (0.5 + 0.5 * Math.sin(p / 3))) + wobble * 0.4 * Math.sin(p * 3);
  });
  ctx.stroke();
  ctx.restore();
}
