import { useReducedMotion } from 'motion/react';

/**
 * Why margin notices happen: much of GB's wind power is in Scotland, most
 * demand is in the Midlands and south, and the links between them have a
 * limit. Drawn portrait so it reads at phone size.
 */
export function FlowDiagram() {
  const still = useReducedMotion() ?? false;
  const flow = 'M 180 96 C 180 150, 180 170, 180 214 S 180 300, 180 356';
  return (
    <figure className="flow">
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- inline SVG exposed as one image */}
      <svg viewBox="0 0 360 470" className="flow-svg" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">Power flows from north to south through a bottleneck</title>
        <desc id="flow-desc">
          Wind farms in Scotland produce more than Scotland uses. The spare power travels south to where most people live, but the
          lines across the border can only carry so much. Imports and southern power stations make up the rest.
        </desc>
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="flow-arrowhead" />
          </marker>
          <path id="flow-path" d={flow} />
        </defs>

        {/* North: generation */}
        <rect x="30" y="18" width="300" height="78" rx="18" className="flow-zone flow-north" />
        <text x="180" y="46" textAnchor="middle" className="flow-zone-title">Scotland</text>
        <text x="180" y="66" textAnchor="middle" className="flow-zone-sub">Lots of wind, fewer people</text>
        <g className="flow-turbines" transform="translate(62 86)">
          <Turbine x={0} still={still} />
          <Turbine x={236} still={still} slow />
        </g>

        {/* The bottleneck */}
        <path d="M 150 170 C 170 196, 170 232, 150 258" className="flow-wall" />
        <path d="M 210 170 C 190 196, 190 232, 210 258" className="flow-wall" />
        <text x="222" y="210" className="flow-label">Transfer limit</text>
        <text x="222" y="226" className="flow-label-sub">Lines across the</text>
        <text x="222" y="240" className="flow-label-sub">border are full</text>

        {/* Flow */}
        <use href="#flow-path" className="flow-pipe" />
        {still
          ? [120, 170, 214, 262, 310].map((cy) => <circle key={cy} cx="180" cy={cy} r="4.5" className="flow-dot" />)
          : [0, 1, 2, 3, 4, 5].map((i) => (
              <circle key={i} r="4.5" className="flow-dot">
                {/* Dots slow down through the bottleneck (a third of the path takes half the time). */}
                <animateMotion dur="4.8s" repeatCount="indefinite" begin={`${-i * 0.8}s`} keyPoints="0;0.34;0.62;1" keyTimes="0;0.25;0.75;1" calcMode="linear">
                  <mpath href="#flow-path" />
                </animateMotion>
              </circle>
            ))}

        {/* South: demand */}
        <rect x="40" y="356" width="280" height="96" rx="18" className="flow-zone flow-south" />
        <text x="180" y="388" textAnchor="middle" className="flow-zone-title">England &amp; Wales</text>
        <text x="180" y="408" textAnchor="middle" className="flow-zone-sub">Most homes and businesses</text>
        <text x="180" y="428" textAnchor="middle" className="flow-zone-sub">Evening peak 16:00–19:00</text>

        {/* Other supply */}
        <path d="M 344 300 C 330 320, 322 336, 316 352" className="flow-side" markerEnd="url(#flow-arrow)" />
        <text x="352" y="270" textAnchor="end" className="flow-label">Imports</text>
        <text x="352" y="286" textAnchor="end" className="flow-label-sub">France, Norway, NL…</text>
        <path d="M 22 300 C 34 320, 40 336, 46 352" className="flow-side" markerEnd="url(#flow-arrow)" />
        <text x="10" y="270" className="flow-label">Southern supply</text>
        <text x="10" y="286" className="flow-label-sub">Gas &amp; batteries</text>
      </svg>
      <figcaption>
        On a still evening there’s little wind to move, so imports and southern power stations have to cover the peak. On 28
        September, NESO said its notice came from network constraints rather than a lack of generation.
      </figcaption>
    </figure>
  );
}

function Turbine({ x, still, slow = false }: { x: number; still: boolean; slow?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <line x1="0" y1="0" x2="0" y2="-26" className="turbine-mast" />
      <g transform="translate(0 -26)">
        <g className="turbine-blades">
          <path d="M 0 0 L -1.6 -15 L 1.6 -15 Z" />
          <path d="M 0 0 L -1.6 -15 L 1.6 -15 Z" transform="rotate(120)" />
          <path d="M 0 0 L -1.6 -15 L 1.6 -15 Z" transform="rotate(240)" />
          {!still && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={slow ? '4.4s' : '3.2s'} repeatCount="indefinite" />}
        </g>
        <circle r="2.2" className="turbine-hub" />
      </g>
    </g>
  );
}
