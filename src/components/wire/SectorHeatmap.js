'use client';

export default function SectorHeatmap({ sectors }) {
  const validSectors = (sectors || [])
    .filter(s => s && s.sector)
    .map(s => {
      const perf7 = parseFloat(s.performance_7d);
      const performance_7d = isNaN(perf7) ? 0 : perf7;

      const perf30 = parseFloat(s.performance_30d);
      const performance_30d = isNaN(perf30) ? 0 : perf30;

      const corr = parseFloat(s.correlation_btc);
      const correlation_btc = isNaN(corr) ? null : corr;

      return {
        ...s,
        performance_7d,
        performance_30d,
        correlation_btc
      };
    });

  if (validSectors.length === 0) {
    return (
      <div className="heatmap-empty-state" style={{ padding: 'var(--space-md)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-sage)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
          No sector performance data available.
        </p>
      </div>
    );
  }

  return (
    <div className="sector-heatmap-grid">
      {validSectors.map((sectorData, index) => {
        const perf = sectorData.performance_7d || 0;
        const isPositive = perf >= 0;
        
        // Calculate background opacity based on performance strength (cap at 25% for max density)
        const strength = Math.min(Math.abs(perf) / 25, 1);
        const bgColor = isPositive
          ? `rgba(74, 222, 128, ${0.03 + strength * 0.12})`
          : `rgba(239, 68, 68, ${0.03 + strength * 0.12})`;
        
        const borderColor = isPositive
          ? `rgba(74, 222, 128, ${0.1 + strength * 0.25})`
          : `rgba(239, 68, 68, ${0.1 + strength * 0.25})`;
        
        const textColor = isPositive ? 'var(--color-pulse-green)' : 'var(--color-shift-red)';

        return (
          <div 
            key={index} 
            className="sector-tile"
            style={{ 
              backgroundColor: bgColor,
              borderColor: borderColor
            }}
          >
            <div className="sector-tile-header">
              <span className="sector-name">{sectorData.sector}</span>
              <span className="sector-perf-badge" style={{ color: textColor, fontFamily: 'var(--font-mono)' }}>
                {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{perf.toFixed(1)}%
              </span>
            </div>
            
            <div className="sector-tile-body">
              <div className="sector-meta-row">
                <span className="meta-label">30d Return</span>
                <span className="meta-val" style={{ fontFamily: 'var(--font-mono)' }}>
                  {(sectorData.performance_30d || 0) >= 0 ? '+' : ''}
                  {(sectorData.performance_30d || 0).toFixed(1)}%
                </span>
              </div>
              <div className="sector-meta-row">
                <span className="meta-label">BTC Correlation</span>
                <span className="meta-val" style={{ color: 'var(--color-data-blue)', fontFamily: 'var(--font-mono)' }}>
                  {(sectorData.correlation_btc !== undefined && sectorData.correlation_btc !== null)
                    ? sectorData.correlation_btc.toFixed(2)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
