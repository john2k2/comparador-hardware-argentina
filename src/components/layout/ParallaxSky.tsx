const SPRITE_SHEET = '/sprites/pixel-art.svg';

const DAY_CLOUDS = [1, 2, 3, 4, 5, 6] as const;
const NIGHT_CLOUDS = [1, 2, 3, 4] as const;

const spriteStyle = { width: '100%', height: 'auto' } as const;
const layerStyle = { position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 } as const;

function Sprite({ id, viewBox }: { id: string; viewBox: string }) {
  return (
    <svg viewBox={viewBox} style={spriteStyle} shapeRendering="crispEdges" aria-hidden="true">
      <use href={`${SPRITE_SHEET}#${id}`} />
    </svg>
  );
}

/**
 * Los patrones de relleno no se resuelven entre documentos con url(), por eso
 * las estrellas viven inline. Sin <animate>: un patrón animado repinta toda la capa.
 */
function StarPatterns() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <pattern id="stars-small" width="250" height="250" patternUnits="userSpaceOnUse">
          <rect x="20" y="40" width="2" height="2" fill="#FFFFFF" opacity="0.3" />
          <rect x="180" y="210" width="2" height="2" fill="#FFFFFF" opacity="0.4" />
          <rect x="120" y="90" width="2" height="2" fill="#FFFFFF" opacity="0.2" />
          <rect x="50" y="220" width="2" height="2" fill="#4DC3E5" opacity="0.5" />
          <rect x="80" y="150" width="2" height="2" fill="#FFFFFF" opacity="0.7" />
          <rect x="210" y="50" width="3" height="3" fill="#FDE047" opacity="0.8" />
          <rect x="15" y="110" width="2" height="2" fill="#FFFFFF" opacity="0.6" />
        </pattern>
        <pattern id="stars-medium" width="350" height="350" patternUnits="userSpaceOnUse">
          <path fill="#FFFFFF" opacity="0.6" d="M 60 50 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
          <path fill="#4DC3E5" opacity="0.6" d="M 250 120 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
          <path fill="#FFFFFF" opacity="0.8" d="M 150 280 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
          <path fill="#FDE047" opacity="0.4" d="M 300 250 h 2 v -2 h 2 v 2 h 2 v 2 h -2 v 2 h -2 v -2 h -2 z" />
        </pattern>
      </defs>
    </svg>
  );
}

export function ParallaxSky() {
  return (
    <>
      <div style={layerStyle} className="sky-bg sky-layer" aria-hidden="true">
        {DAY_CLOUDS.map((n) => (
          <div key={n} className={`cloud-wrapper cloud-${n}`}>
            <div className="cloud-inner"><Sprite id="cloud-pixel-art" viewBox="0 0 34 22" /></div>
          </div>
        ))}
      </div>

      <div style={layerStyle} className="night-sky-bg night-sky-layer" aria-hidden="true">
        <StarPatterns />
        <div className="night-stars-layer stars-slow" style={{ width: '200vw', height: '100%' }}>
          <svg width="100%" height="100%" aria-hidden="true">
            <rect width="100%" height="100%" fill="url(#stars-small)" />
          </svg>
        </div>
        <div className="night-stars-layer stars-fast" style={{ width: '200vw', height: '100%' }}>
          <svg width="100%" height="100%" aria-hidden="true">
            <rect width="100%" height="100%" fill="url(#stars-medium)" />
          </svg>
        </div>

        <div className="night-moon-layer"><Sprite id="pixel-moon" viewBox="0 0 16 16" /></div>

        <div className="shooting-star shooting-star-1" />
        <div className="shooting-star shooting-star-2" />
        <div className="shooting-star shooting-star-3" />

        <div className="comet-container"><Sprite id="pixel-comet" viewBox="0 0 45 15" /></div>

        {NIGHT_CLOUDS.map((n) => (
          <div key={n} className={`night-cloud-wrapper night-cloud-${n}`}>
            <div className="night-cloud-inner"><Sprite id="cloud-night-pixel-art" viewBox="0 0 34 22" /></div>
          </div>
        ))}
      </div>
    </>
  );
}
