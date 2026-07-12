'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const NARRATIVES_METADATA = {
  'NAR_01': { name: 'Institutional Accumulation', color: 'var(--color-wire-gold)', desc: 'Large-scale capital entry via ETFs & custodians' },
  'NAR_02': { name: 'Retail FOMO', color: 'var(--color-alert-amber)', desc: 'Accelerating retail buy volume and viral social activity' },
  'NAR_03': { name: 'Regulatory Storm', color: 'var(--color-shift-red)', desc: 'Regulatory and policy compliance actions' },
  'NAR_04': { name: 'AI/Tech Rotation', color: 'var(--color-data-blue)', desc: 'Capital migrating into AI & computational networks' },
  'NAR_05': { name: 'DeFi Renaissance', color: 'var(--color-pulse-green)', desc: 'Yield activity, TVL expansion & protocol usage' },
  'NAR_06': { name: 'Risk-Off Flight', color: 'var(--color-sage)', desc: 'Capital flight to stablecoins and de-leveraging' },
  'NAR_07': { name: 'L2/Infra Cycle', color: 'var(--color-data-blue)', desc: 'Core infrastructure upgrades and L2 rollup activity' },
  'NAR_08': { name: 'Black Swan', color: 'var(--color-shift-red)', desc: 'Extreme security exploits, insolvencies, or anomalies' }
};

export default function BubbleMap({ temperatures = {} }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = 400; // Match spec heights

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Prepare data with proper scaling
    const nodes = Object.keys(NARRATIVES_METADATA).map(id => {
      const details = temperatures[id] || { temperature: 30, newsScore: 30, flowScore: 30, sectorScore: 30 };
      const temp = Math.max(0, Math.min(100, details.temperature));
      return {
        id,
        name: NARRATIVES_METADATA[id].name,
        desc: NARRATIVES_METADATA[id].desc,
        color: NARRATIVES_METADATA[id].color,
        temperature: temp,
        newsScore: details.newsScore || 0,
        flowScore: details.flowScore || 0,
        sectorScore: details.sectorScore || 0,
        r: 30 + (temp * 0.6) // Radius scales between 30px and 90px
      };
    });

    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', 'transparent');

    // Drag helper behaviors
    const simulation = d3.forceSimulation(nodes)
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.r + 15).strength(0.85))
      .alphaDecay(0.02)
      .alpha(1);

    // Filter glow defs
    const defs = svg.append('defs');
    
    // Create radial gradients for each bubble
    nodes.forEach(node => {
      const gradient = defs.append('radialGradient')
        .attr('id', `grad-${node.id}`)
        .attr('cx', '50%')
        .attr('cy', '50%')
        .attr('r', '50%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', 'var(--color-wire-gold)')
        .attr('stop-opacity', 0.95);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', node.color)
        .attr('stop-opacity', 0.45);
    });

    const glowFilter = defs.append('filter')
      .attr('id', 'bubble-glow')
      .attr('x', '-30%')
      .attr('y', '-30%')
      .attr('width', '160%')
      .attr('height', '160%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', 6)
      .attr('result', 'blur');
    const merge = glowFilter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Create bubble groups
    const elem = svg.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d);
      })
      .on('mouseover', function(event, d) {
        d3.select(this).select('.main-circle')
          .transition()
          .duration(200)
          .attr('stroke-width', 2.5)
          .attr('stroke', 'var(--color-wire-gold)')
          .attr('filter', 'url(#bubble-glow)');
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).select('.main-circle')
          .transition()
          .duration(200)
          .attr('stroke-width', 1)
          .attr('stroke', d.color)
          .attr('filter', d.temperature >= 80 ? 'url(#bubble-glow)' : 'none');
      });

    // Append main bubble circle
    elem.append('circle')
      .attr('class', 'main-circle')
      .attr('r', 0) // Starts at 0 for load animation
      .attr('fill', d => `url(#grad-${d.id})`)
      .attr('stroke', d => d.color)
      .attr('stroke-width', 1)
      .attr('filter', d => d.temperature >= 80 ? 'url(#bubble-glow)' : 'none')
      .transition()
      .duration(800)
      .ease(d3.easeBackOut)
      .attr('r', d => d.r);

    // Inner core representing temperature magnitude
    elem.append('circle')
      .attr('class', 'core-circle')
      .attr('r', 0)
      .attr('fill', d => d.color)
      .style('opacity', 0.8)
      .transition()
      .duration(900)
      .ease(d3.easeBackOut)
      .attr('r', d => Math.max(3, d.r * 0.15));

    // Name label (wrapped first word / rest)
    elem.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-6px')
      .style('fill', 'var(--color-linen)')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', d => `${Math.max(9, d.r * 0.16)}px`)
      .style('font-weight', '400')
      .style('pointer-events', 'none')
      .text(d => d.name.split(' ')[0] || '');

    elem.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '8px')
      .style('fill', 'var(--color-linen)')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', d => `${Math.max(9, d.r * 0.15)}px`)
      .style('font-weight', '400')
      .style('pointer-events', 'none')
      .text(d => d.name.split(' ').slice(1).join(' ') || '');

    // Temperature text value
    elem.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '24px')
      .style('fill', 'var(--color-wire-gold)')
      .style('font-family', 'var(--font-mono)')
      .style('font-size', d => `${Math.max(10, d.r * 0.18)}px`)
      .style('font-weight', '700')
      .style('pointer-events', 'none')
      .text(d => `${d.temperature.toFixed(0)}°`);

    elem.call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended)
    );

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    function ticked() {
      elem.attr('transform', d => {
        const r = d.r;
        const x = Math.max(r + 15, Math.min(width - r - 15, d.x));
        const y = Math.max(r + 15, Math.min(height - r - 15, d.y));
        d.x = x;
        d.y = y;
        return `translate(${x}, ${y})`;
      });
    }

    simulation.on('tick', ticked);

    return () => {
      simulation.stop();
    };
  }, [temperatures]);

  // Determine trend icon & color dynamically for tooltip
  let trendIcon = '→';
  let trendColor = 'var(--color-sage)';
  if (selectedNode) {
    if (selectedNode.temperature >= 80) {
      trendIcon = '▲';
      trendColor = 'var(--color-shift-red)';
    } else if (selectedNode.temperature >= 50) {
      trendIcon = '▲';
      trendColor = 'var(--color-wire-gold)';
    }
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} className="bubble-map-svg"></svg>

      {/* Selected Node Tooltip Overlay */}
      {selectedNode && (
        <div 
          className="clay-glass" 
          style={{
            position: 'absolute',
            bottom: 'var(--space-md)',
            left: 'var(--space-md)',
            right: 'var(--space-md)',
            padding: 'var(--space-md)',
            borderRadius: '12px',
            fontSize: '0.825rem',
            color: 'var(--color-linen)',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xs)' }}>
            <div>
              <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: selectedNode.color }} />
                {selectedNode.name}
              </h4>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', fontStyle: 'italic', marginTop: '2px' }}>
                {selectedNode.desc}
              </p>
            </div>
            <button 
              onClick={() => setSelectedNode(null)}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                color: 'var(--color-sage)',
                backgroundColor: 'rgba(236, 223, 204, 0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
          
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: 'var(--space-sm)', 
              marginTop: 'var(--space-md)', 
              paddingTop: 'var(--space-sm)', 
              borderTop: '1px solid var(--glass-border)', 
              textAlign: 'center' 
            }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Temp</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-linen)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {selectedNode.temperature.toFixed(0)}° <span style={{ color: trendColor, fontSize: '0.8rem' }}>{trendIcon}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>News</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-data-blue)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {selectedNode.newsScore.toFixed(0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Flows</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-wire-gold)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {selectedNode.flowScore.toFixed(0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Sectors</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-pulse-green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {selectedNode.sectorScore.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
