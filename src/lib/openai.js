import OpenAI from 'openai';

/**
 * OpenAI-compatible API Client for Cinder (Xiaomi MiMo).
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

/**
 * Generates a concise Market Pulse report based on ETF flows and sector movers.
 * @param {Object} data - Current ETF flows, sector data, and top news headlines
 * @returns {Promise<string>} Generated Market Pulse report (Markdown format)
 */
export async function generateMarketPulse(data) {
  const btcFlow = data.btcFlow !== undefined ? data.btcFlow : (data.btc_flow || 'N/A');
  const ethFlow = data.ethFlow !== undefined ? data.ethFlow : (data.eth_flow || 'N/A');
  const topSector = data.topSector || data.top_sector || 'N/A';
  const topSectorReturn = data.topSectorReturn || data.top_sector_return || 'N/A';
  const bottomSector = data.bottomSector || data.bottom_sector || 'N/A';
  const bottomSectorReturn = data.bottomSectorReturn || data.bottom_sector_return || 'N/A';
  const narrativeTemp = data.narrativeTemp !== undefined ? data.narrativeTemp : (data.narrative_temp || data.temperature || 'N/A');
  
  let headlinesStr = 'N/A';
  if (Array.isArray(data.headlines)) {
    headlinesStr = data.headlines.map(h => typeof h === 'string' ? h : (h.title || '')).slice(0, 5).join('\n- ');
    headlinesStr = '\n- ' + headlinesStr;
  } else if (typeof data.headlines === 'string') {
    headlinesStr = data.headlines;
  }

  const prompt = `You are Cinder, an AI financial wire service. Write a Market Pulse report.

DATA PROVIDED:
- BTC ETF Net Flow: ${btcFlow}
- ETH ETF Net Flow: ${ethFlow}
- Top performing sector: ${topSector} (${topSectorReturn})
- Bottom performing sector: ${bottomSector} (${bottomSectorReturn})
- Top AI News Headlines: ${headlinesStr}
- Current Narrative Temperature: ${narrativeTemp}

REPORT STRUCTURE & FORMAT:
- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Lead with the most significant data point
- Include ONE forward-looking "AI Analysis" paragraph
- End with narrative temperature reading
- Keep under 300 words
- Do NOT use emojis in the body text

HEADLINE & CONTENT RULES:
- The Headline MUST NEVER lead with a raw percentage or a "<Asset> News:" format.
- The Headline MUST lead with a specific actor, an anomaly, or a comparison to a prior period — pull the single highest-signal data point, not the aggregate score.
- BANNED words/phrases (do NOT use these in the headline or the story body): surges, plunges, "here's what you need to know", explained, alert, breaking.
- If no genuinely distinctive angle exists in the data, say so plainly rather than manufacturing one.
- Do not make your story look too generic; make it more human, writing with an engaging and analytical touch, avoiding typical robotic wire clichés.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an institutional financial journalist specializing in engaging, human-centric narrative reporting.' },
        { role: 'user', content: prompt }
      ]
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating Market Pulse:', error);
    throw error;
  }
}

/**
 * Generates an in-depth Daily Deep Dive report.
 * @param {Object} data - Historical ETF trends, sector performance, and narrative states
 * @returns {Promise<string>} Generated Daily Deep Dive report (Markdown format)
 */
export async function generateDailyDeepDive(data) {
  const etfFlowTrend = data.etfFlowTrend || data.etf_flow_trend || 'N/A';
  const sectorComparison = data.sectorComparison || data.sector_comparison || 'N/A';
  const newsSentiment = data.newsSentiment || data.news_sentiment || 'N/A';
  const narrativeState = data.narrativeState || data.narrative_state || 'N/A';

  const prompt = `You are Cinder, an AI financial wire service. Write an in-depth Daily Deep Dive market analysis.

DATA PROVIDED:
- 7-Day ETF Flow Trend: ${typeof etfFlowTrend === 'object' ? JSON.stringify(etfFlowTrend) : etfFlowTrend}
- Sector Performance & Comparison: ${typeof sectorComparison === 'object' ? JSON.stringify(sectorComparison) : sectorComparison}
- AI News Sentiment Analysis: ${typeof newsSentiment === 'object' ? JSON.stringify(newsSentiment) : newsSentiment}
- Current Narrative State: ${typeof narrativeState === 'object' ? JSON.stringify(narrativeState) : narrativeState}

RULES:
- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Write in a professional, Wall Street research note style: analytical, objective, detailed.
- Structure the report into:
  1. Executive Summary
  2. Institutional Capital Flows (analyzing ETF trends)
  3. Sector Rotation & Relative Strength (analyzing sector performance)
  4. Narrative Intelligence (analyzing current dominant narratives, sentiment, and temperatures)
  5. Outlook & Forward-Looking Risk Analysis
- Output should be approximately 800 words in Markdown format.
- Integrate references to the flow trend chart and sector heatmap (placeholder markers like [ETF Flow Trend Chart] or [Sector Heatmap] are fine for client rendering).
- Do NOT use emojis.

HEADLINE & CONTENT RULES:
- The Headline MUST NEVER lead with a raw percentage or a "<Asset> News:" format.
- The Headline MUST lead with a specific actor, an anomaly, or a comparison to a prior period — pull the single highest-signal data point, not the aggregate score.
- BANNED words/phrases (do NOT use these in the headline or the story body): surges, plunges, "here's what you need to know", explained, alert, breaking.
- If no genuinely distinctive angle exists in the data, say so plainly rather than manufacturing one.
- Do not make your story look too generic; make it more human, writing with an engaging and analytical touch, avoiding typical robotic wire clichés.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an institutional financial analyst and research editor specializing in engaging, human-centric narrative reporting.' },
        { role: 'user', content: prompt }
      ]
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating Daily Deep Dive:', error);
    throw error;
  }
}

/**
 * Generates a breaking news alert when a narrative regime shift occurs.
 * @param {Object} params - Shift detection details and trade execution records
 * @returns {Promise<string>} Generated Breaking Alert (Markdown format)
 */
export async function createBreakingStory({ shiftData, tradeData, publishedAt }) {
  const fromNarrative = shiftData?.previousNarrative || shiftData?.fromNarrative || shiftData?.from_narrative || 'N/A';
  const toNarrative = shiftData?.dominantNarrative || shiftData?.toNarrative || shiftData?.to_narrative || 'N/A';
  const confidence = shiftData?.confidence || 'N/A';
  const signals = shiftData?.signals || shiftData?.evidence || [];
  
  const side = tradeData?.side || 'N/A';
  const pair = tradeData?.pair || 'N/A';
  const quantity = tradeData?.quantity || 'N/A';
  const fillPrice = tradeData?.fillPrice || tradeData?.price || 'N/A';
  const status = tradeData?.status || 'N/A';
  const orderId = tradeData?.orderId || 'N/A';
  
  let signalsStr = 'N/A';
  if (Array.isArray(signals)) {
    signalsStr = signals.map(s => `- ${s}`).join('\n');
  } else if (typeof signals === 'object') {
    signalsStr = JSON.stringify(signals);
  } else {
    signalsStr = signals;
  }

  const prompt = `You are Cinder, an AI financial wire service. Write a News Alert about a market narrative regime change.

SHIFT DETAILS:
- Previous Narrative: ${fromNarrative}
- New Narrative: ${toNarrative}
- Shift Confidence: ${confidence}%
- Supporting Signals / Evidence:
${signalsStr}

TRADE DETAILS:
- Side: ${side}
- Trading Pair: ${pair}
- Quantity: ${quantity}
- Fill Price: ${fillPrice}
- Execution Status: ${status}
- Order ID: ${orderId}
- Executed At: ${publishedAt}

RULES:
- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Clearly present the transition from the old narrative regime to the new one.
- Include a Markdown table detailing the supporting evidence (signals) that triggered this shift.
- Outline the trade execution details and explain the quantitative reasoning behind the trade.
- Write in a factual, professional, and institutional tone.
- Do NOT use emojis.
- Output should be approximately 500 words in Markdown.

HEADLINE & CONTENT RULES:
- The Headline MUST NEVER lead with a raw percentage or a "<Asset> News:" format.
- The Headline MUST lead with a specific actor, an anomaly, or a comparison to a prior period — pull the single highest-signal data point, not the aggregate score.
- BANNED words/phrases (do NOT use these in the headline or the story body): surges, plunges, "here's what you need to know", explained, alert, breaking.
- If no genuinely distinctive angle exists in the data, say so plainly rather than manufacturing one.
- Do not make your story look too generic; make it more human, writing with an engaging and analytical touch, avoiding typical robotic wire clichés.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an institutional financial wire editor specializing in engaging, human-centric narrative reporting.' },
        { role: 'user', content: prompt }
      ],
      signal: AbortSignal.timeout(30000)
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating Breaking Alert:', error);
    throw error;
  }
}

/**
 * Classifies news articles/headlines into dominant crypto narrative archetypes.
 * @param {Array<Object>} headlines - List of headlines/summaries to classify
 * @returns {Promise<Object>} Narrative keyword frequencies and sentiment scores
 */
export async function classifyNarrativeText(headlines) {
  if (!headlines || headlines.length === 0) {
    return {
      keywordFrequencies: {},
      sentimentScores: {}
    };
  }

  // Format headlines for prompt
  const headlinesFormatted = headlines.map((h, i) => {
    const title = typeof h === 'string' ? h : (h.title || '');
    const summary = typeof h === 'string' ? '' : (h.summary || '');
    return `[ID: ${i}] Title: ${title}\nSummary: ${summary}`;
  }).join('\n\n');

  const systemPrompt = `You are an AI financial analyst specializing in crypto markets.
Analyze the following news headlines and summaries, and for each headline:
1. Extract relevant keywords.
2. Determine sentiment on a scale from -1.0 (extremely negative) to 1.0 (extremely positive).
3. Classify it into one of the 8 crypto narrative archetypes:
   - NAR_01: Institutional Accumulation (adoption, ETFs, etc.)
   - NAR_02: Retail FOMO (moon, ATH, breakouts)
   - NAR_03: Regulatory Storm (SEC, bans, compliance)
   - NAR_04: AI/Tech Rotation (AI, GPU, artificial intelligence)
   - NAR_05: DeFi Renaissance (DeFi, yield, TVL, protocol)
   - NAR_06: Risk-Off Flight (macro crash, recession, risk-off)
   - NAR_07: L2/Infra Cycle (scaling, rollups, Layer 2)
   - NAR_08: Black Swan (hack, systemic collapse, volume anomaly)
   - NONE: If it does not fit any of these archetypes.

You must return a JSON object with:
- "classifications": an array of items, each containing:
  - "id": the ID number from the input
  - "sentiment": floating point number between -1.0 and 1.0
  - "keywords": array of lowercase keywords extracted
  - "archetype": the archetype ID (NAR_01 to NAR_08, or NONE)`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: headlinesFormatted }
      ],
      response_format: { type: 'json_object' }
    });

    const parsedResult = JSON.parse(response.choices[0].message.content);
    
    // Process results to aggregate keyword frequencies and sentiment scores
    const keywordFrequencies = {};
    const sentimentScores = {};
    
    // Initialize archetype sentiment scores lists
    const archetypeSentiments = {};
    for (let i = 1; i <= 8; i++) {
      archetypeSentiments[`NAR_0${i}`] = [];
    }

    if (parsedResult && parsedResult.classifications) {
      for (const cls of parsedResult.classifications) {
        // Count keywords
        if (Array.isArray(cls.keywords)) {
          for (const kw of cls.keywords) {
            const normalizedKw = kw.toLowerCase().trim();
            keywordFrequencies[normalizedKw] = (keywordFrequencies[normalizedKw] || 0) + 1;
          }
        }
        
        // Group sentiment by archetype
        if (cls.archetype && archetypeSentiments[cls.archetype]) {
          archetypeSentiments[cls.archetype].push(cls.sentiment);
        }
      }
    }

    // Calculate average sentiment for each archetype
    for (let i = 1; i <= 8; i++) {
      const id = `NAR_0${i}`;
      const sents = archetypeSentiments[id];
      if (sents.length > 0) {
        sentimentScores[id] = sents.reduce((a, b) => a + b, 0) / sents.length;
      } else {
        sentimentScores[id] = 0; // neutral default
      }
    }

    return {
      keywordFrequencies,
      sentimentScores,
      classifications: parsedResult.classifications || []
    };

  } catch (error) {
    console.error('Error in classifyNarrativeText:', error);
    return {
      keywordFrequencies: {},
      sentimentScores: {},
      classifications: [],
      error: true
    };
  }
}

/**
 * Classifies a batch of news items in a single OpenAI request.
 * Returns a map of news ID to story type ('news', 'breaking', 'deep_dive', 'pulse').
 */
export async function classifyNewsBatch(newsItems) {
  if (!newsItems || newsItems.length === 0) return {};
  
  const formattedItems = newsItems.map(item => 
    `ID: ${item.id}\nTitle: ${item.title}\nSummary: ${item.summary || 'N/A'}`
  ).join('\n---\n');

  const prompt = `You are a crypto narrative intelligence analyst. You are given a batch of recent crypto news items.
Your job is to categorize each news item into one of the following four channels:
1. "news": Standard, routine daily news or updates (default for most items).
2. "breaking": Highly critical, market-moving events or anomalies (e.g. major hacks, regulatory actions, sudden liquidations, black swans) that require an immediate Breaking Alert.
3. "deep_dive": Analytical, long-term structural changes, protocol updates, or macro shifts that require an in-depth analysis report.
4. "pulse": Short-term market performance, major price movements, or ETF flow developments.

Analyze the news items below and return a JSON object containing a "classifications" array, where each object has:
- "id": The ID of the news item
- "classification": "news" | "breaking" | "deep_dive" | "pulse"
- "reasoning": A brief explanation for any item classified as "breaking", "deep_dive", or "pulse".

News Items:
${formattedItems}`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an expert crypto market intelligence classifier.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(response.choices[0].message.content);
    const mapping = {};
    if (result && Array.isArray(result.classifications)) {
      for (const cls of result.classifications) {
        mapping[cls.id] = cls.classification || 'news';
      }
    }
    return mapping;
  } catch (error) {
    console.error('Error in classifyNewsBatch:', error);
    return {};
  }
}

/**
 * Generates a full markdown report based on a specific high-signal news event.
 * @param {string} type - 'pulse' | 'deep_dive' | 'breaking'
 * @param {Object} newsItem - The news item details (title, summary)
 * @param {Object} marketContext - ETF flows, sector performance, narrative temperatures
 */
export async function generateStoryFromNewsItem(type, newsItem, marketContext) {
  const btcFlow = marketContext.btcFlow || 'N/A';
  const ethFlow = marketContext.ethFlow || 'N/A';
  const sectorPerf = marketContext.sectorPerf ? JSON.stringify(marketContext.sectorPerf) : 'N/A';
  const temps = marketContext.temps ? JSON.stringify(marketContext.temps) : 'N/A';

  let styleDesc = '';
  let structureRules = '';
  let length = 300;

  if (type === 'breaking') {
    styleDesc = 'factual, high-urgency, professional wire news alert';
    length = 400;
    structureRules = `- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Clearly present the core breaking event and why it matters to the market
- Outline any potential immediate liquidity or volatility implications
- Include a summary of current narrative states and relevant market indicators`;
  } else if (type === 'deep_dive') {
    styleDesc = 'professional Wall Street research note style: analytical, objective, detailed';
    length = 600;
    structureRules = `- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Structure into sections: Executive Summary, Industry Context, Structural Implications, Market Analysis, and Risk/Outlook
- Include analytical markdown tables or bullet points comparing current market metrics`;
  } else {
    styleDesc = 'concise, data-driven Market Pulse report';
    length = 250;
    structureRules = `- First line MUST be the Headline, starting with a markdown header (e.g. # Headline)
- Present a swift market performance update, leading with the news item's market impact
- Summarize ETF flows and active sector performance`;
  }

  const prompt = `You are Cinder, an AI financial wire service. Write a ${type} report based on the following high-signal news event.

NEWS EVENT:
- Title: ${newsItem.title}
- Content: ${newsItem.summary || 'None'}

MARKET CONTEXT DATA:
- BTC ETF Net Flow: ${btcFlow}
- ETH ETF Net Flow: ${ethFlow}
- Sector Performance: ${sectorPerf}
- Narrative Temperatures: ${temps}

RULES:
- Style: Write in a ${styleDesc}.
- Length: Approximately ${length} words.
- Formatting: Use clean markdown.
${structureRules}

HEADLINE & CONTENT RULES:
- The Headline MUST NEVER lead with a raw percentage or a "<Asset> News:" format.
- The Headline MUST lead with a specific actor, an anomaly, or a comparison to a prior period — pull the single highest-signal data point, not the aggregate score.
- BANNED words/phrases (do NOT use these in the headline or the story body): surges, plunges, "here's what you need to know", explained, alert, breaking.
- If no genuinely distinctive angle exists in the data, say so plainly rather than manufacturing one.
- Do not make your story look too generic; write with a human, analytical touch, avoiding typical robotic wire clichés.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an institutional financial editor specializing in engaging, human-centric reporting.' },
        { role: 'user', content: prompt }
      ]
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`Error generating ${type} story from news:`, error);
    throw error;
  }
}

/**
 * Refines a batch of news items in a single OpenAI request.
 */
export async function refineNewsBatch(newsItems) {
  if (!newsItems || newsItems.length === 0) return [];
  
  const formattedItems = newsItems.map(item => 
    `ID: ${item.id}\nTitle: ${item.title}\nSummary: ${item.summary || 'N/A'}`
  ).join('\n---\n');

  const prompt = `You are Cinder, a premium financial news wire. Refine/rewrite the following batch of raw news articles (headlines and summaries) to be more human, engaging, and professional.

RULES:
- For each item, rewrite the Headline and Summary.
- The Headline MUST NEVER lead with a raw percentage or a "<Asset> News:" format.
- The Headline MUST lead with a specific actor, an anomaly, or a comparison to a prior period.
- BANNED words/phrases (do NOT use these in the headline or summary): surges, plunges, "here's what you need to know", explained, alert, breaking.
- Maintain a factual, professional, and institutional tone but make it human-centric and engaging, avoiding dry robotic templates.
- Keep the summary clear, concise, and under 150 words.

Return a JSON object containing a "refined" array, where each object has:
- "id": The original ID
- "title": The refined headline
- "summary": The refined summary

News Items:
${formattedItems}`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'mimo-v2.5',
      messages: [
        { role: 'system', content: 'You are an expert financial wire editor specializing in human-centric rewriting.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(response.choices[0].message.content);
    return result.refined || [];
  } catch (error) {
    console.error('Error refining news batch:', error);
    return [];
  }
}

/**
 * Refines all news items in chunks.
 */
export async function refineAllNews(newsItems) {
  const batchSize = 10;
  const refinedResults = [];
  for (let i = 0; i < newsItems.length; i += batchSize) {
    const batch = newsItems.slice(i, i + batchSize);
    console.log(`[AI] Refining news batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(newsItems.length / batchSize)}...`);
    const refined = await refineNewsBatch(batch);
    refinedResults.push(...refined);
  }
  
  const refinedMap = {};
  for (const item of refinedResults) {
    refinedMap[String(item.id)] = item;
  }
  
  return newsItems.map(item => {
    const refined = refinedMap[item.id];
    return {
      ...item,
      title: refined?.title || item.title,
      summary: refined?.summary || item.summary
    };
  });
}

