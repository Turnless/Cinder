'use client';

import React from 'react';

export default function TemperatureGauge({ 
  temperature = 0, 
  label = 'Temperature', 
  diameter = 120 
}) {
  const roundedTemp = Math.round(temperature);
  const strokeWidth = 8;
  const radius = (diameter / 2) - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, temperature)) / 100) * circumference;

  // Determine arc progress color
  let progressColor = 'var(--color-sage)';
  let filterGlow = 'none';

  if (temperature >= 80) {
    progressColor = 'var(--color-shift-red)';
    filterGlow = 'url(#gauge-glow-red)';
  } else if (temperature >= 60) {
    progressColor = 'var(--color-alert-amber)';
  } else if (temperature >= 40) {
    progressColor = 'var(--color-data-blue)';
  }

  // Font sizes scale with gauge diameter
  const valueFontSize = diameter >= 180 ? '2.5rem' : '1.5rem';
  const labelFontSize = diameter >= 180 ? '0.78rem' : '0.68rem';

  return (
    <div className="gauge-container" style={{ width: diameter, height: diameter }}>
      <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
        <defs>
          {/* Red Glow Filter for Narrative Shifts (>80 degrees) */}
          <filter id="gauge-glow-red" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComponentTransfer in="blur" result="glow">
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background Track Ring */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="var(--color-iron)"
          strokeWidth={strokeWidth}
        />

        {/* Foreground Progress Arc */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
          filter={filterGlow}
          style={{ transition: 'stroke-dashoffset 1.2s ease-in-out' }}
        />
      </svg>

      {/* Center Absolute Label Panel */}
      <div 
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        <span 
          style={{ 
            fontFamily: 'var(--font-mono)', 
            fontWeight: 700, 
            fontSize: valueFontSize, 
            color: 'var(--color-linen)',
            lineHeight: 1
          }}
        >
          {roundedTemp}°
        </span>
        <span 
          style={{ 
            fontFamily: 'var(--font-body)', 
            fontSize: labelFontSize, 
            color: 'var(--color-sage)',
            marginTop: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            maxWidth: diameter - 32,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
