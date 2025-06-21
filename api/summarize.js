// api/summarize.js 

async function queryHuggingFace(data, model) {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hugging Face API error: ${error}`);
    }
    
    return response.json();
  }
  
  function getSummaryParameters(length) {
    const params = {
      short: { max_length: 200, min_length: 100 },    // Increased for more detail
      medium: { max_length: 400, min_length: 200 },   // Increased for comprehensive coverage
      long: { max_length: 600, min_length: 300 }      // Increased for extensive detail
    };
    
    return params[length] || params.short;
  }
  
  async function fetchWikipediaContent(url) {
    try {
      // Extract article title from URL
      const articleTitle = decodeURIComponent(url.split('/wiki/')[1].replace(/_/g, ' '));
      
      // Fetch Wikipedia content using Wikipedia API
      const wikiResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`
      );
  
      if (!wikiResponse.ok) {
        if (wikiResponse.status === 404) {
          throw new Error(`Article "${articleTitle}" not found`);
        }
        throw new Error(`Failed to fetch article "${articleTitle}"`);
      }
  
      const wikiData = await wikiResponse.json();
      
      // Get the full article content for better summarization
      const contentResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(articleTitle)}&prop=extracts&exintro=false&explaintext=true&exsectionformat=plain`
      );
  
      const contentData = await contentResponse.json();
      const pages = contentData.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId === '-1') {
        throw new Error(`Article "${articleTitle}" not found`);
      }
      
      const fullContent = pages[pageId]?.extract || wikiData.extract;
  
      if (!fullContent) {
        throw new Error(`Content for "${articleTitle}" is empty`);
      }
  
      return {
        title: articleTitle,
        content: fullContent,
        url: url
      };
    } catch (error) {
      console.error(`Error fetching content for ${url}:`, error.message);
      throw error;
    }
  }
  
  async function generateSummary(content, title, summaryParams) {
    // Truncate content for summarization model
    const maxInputLength = 4000;
    const truncatedContent = content.length > maxInputLength 
      ? content.substring(0, maxInputLength) + '...'
      : content;
  
    // Generate summary using Hugging Face
    const models = [
      'facebook/bart-large-cnn',
      'microsoft/DialoGPT-medium',
      'google/pegasus-xsum',
      't5-base'
    ];
  
    let summary = null;
    let lastError = null;
  
    for (const model of models) {
      try {
        // Create enhanced prompts for better structured summaries
        const isMultipleArticles = title.includes(',');
        let promptText;
        
        if (isMultipleArticles) {
          promptText = `Create a comprehensive, detailed, and well-structured summary of these Wikipedia articles: ${title}. 

Your response must include these sections with substantial detail:

## Executive Summary
Write a compelling 2-3 sentence overview that captures the essence and connections between all topics.

## Core Concepts & Definitions  
Define each major topic clearly with key characteristics, properties, and distinguishing features. Use bullet points for clarity.

## Historical Context & Background
Provide important historical information, origins, development timeline, and key figures or events that shaped these topics.

## Key Relationships & Interconnections
Explain how these topics relate to each other, influence one another, or work together. Include cause-and-effect relationships.

## Important Facts & Details
List significant statistics, dates, names, processes, or technical details that are crucial for understanding. Use specific examples.

## Current Applications & Relevance
Describe how these topics are relevant today, their practical applications, and their impact on society or respective fields.

## Significance & Future Implications
Explain why these topics matter, their broader importance, and potential future developments or trends.

Content to analyze:
${truncatedContent}

Write in clear, accessible language with specific details, examples, and quantifiable information where available. Each section should be substantial and informative.`;
        } else {
          promptText = `Create a comprehensive, detailed, and well-structured summary of this Wikipedia article about ${title}.

Your response must include these sections with substantial detail:

## Executive Summary
Write a compelling 2-3 sentence overview that captures the essence and importance of this topic.

## Core Definition & Key Characteristics
Clearly define what this topic is, its main properties, features, or components. Use bullet points for key attributes.

## Historical Background & Origins
Provide historical context, when/how it originated, key developments, and important figures or events in its history.

## Main Categories & Classifications
If applicable, describe different types, categories, or branches within this topic. Explain distinctions and relationships.

## Important Facts & Statistics  
List crucial facts, figures, dates, measurements, or data points. Include specific examples and quantifiable information.

## Process & Mechanism (if applicable)
Explain how something works, its methodology, or step-by-step processes involved.

## Current Applications & Uses
Describe practical applications, real-world uses, and how this topic impacts daily life or its field.

## Significance & Impact
Explain the broader importance, influence on society/field, and why this topic matters today and for the future.

Content to analyze:
${truncatedContent}

Write in clear, accessible language with specific details, concrete examples, and quantifiable information. Each section should be informative and substantial.`;
        }
        
        const result = await queryHuggingFace({
          inputs: promptText,
          parameters: {
            max_length: Math.max(summaryParams.max_length * 2.5, 600), // Significantly increased for more detail
            min_length: Math.max(summaryParams.min_length * 2, 200),
            do_sample: true,
            temperature: 0.3, // Lower for more focused content
            repetition_penalty: 1.3, // Higher to avoid repetition
            length_penalty: 1.1, // Encourage longer, more detailed responses
            top_p: 0.9,
            num_beams: 4
          }
        }, model);
  
        if (result && result[0]) {
          if (result[0].summary_text) {
            summary = result[0].summary_text;
            break;
          } else if (result[0].generated_text) {
            let generatedText = result[0].generated_text;
            // Clean up the generated text
            const summaryStart = generatedText.toLowerCase().indexOf('executive summary');
            if (summaryStart !== -1) {
              generatedText = generatedText.substring(summaryStart - 3).trim();
            }
            summary = generatedText;
            break;
          }
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }
  
    if (!summary) {
      // Enhanced fallback: create a more detailed structured summary from the content
      console.log('All AI models failed, creating enhanced fallback structured summary...');
      summary = createEnhancedFallbackSummary(truncatedContent, title, isMultipleArticles);
    }
  
    // Post-process the summary for better structure and detail
    summary = enhanceAndExpandSummaryStructure(summary, title, truncatedContent);
    
    return summary;
  }
  
  function createEnhancedFallbackSummary(content, title, isMultiple) {
    // Extract key information from content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 25);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    
    // Extract key facts - look for numbers, dates, and specific terms
    const facts = sentences.filter(s => 
      /\b\d{4}\b|\b\d+[,.]?\d*\s*(percent|%|million|billion|thousand)|\b(founded|established|created|born|died|invented)\b/i.test(s)
    ).slice(0, 4);
    
    // Extract definitions and key concepts
    const definitions = sentences.filter(s => 
      /\bis\s+(a|an|the)|\bdefines?\b|\bknown\s+as\b|\brefers?\s+to\b/i.test(s)
    ).slice(0, 3);
    
    // Extract historical information
    const historical = sentences.filter(s => 
      /\b(century|era|period|ancient|medieval|modern|history|historical|originally|first|began|started)\b/i.test(s)
    ).slice(0, 3);
    
    if (isMultiple) {
      const topics = title.split(', ');
      return `## Executive Summary
${topics.join(' and ')} are interconnected subjects that represent significant areas of knowledge with substantial impact on their respective fields and society at large.

## Core Concepts & Definitions
${definitions.length > 0 ? definitions.map(s => `• ${s.trim()}.`).join('\n') : '• These topics encompass fundamental concepts that are essential for understanding their respective domains.'}

## Historical Context & Background
${historical.length > 0 ? historical.map(s => `• ${s.trim()}.`).join('\n') : '• These subjects have evolved over time through various historical developments and contributions from numerous scholars and practitioners.'}

## Key Relationships & Interconnections
• These topics are interconnected through shared principles, methodologies, and applications
• They influence each other through cross-disciplinary research and practical implementations
• Understanding one enhances comprehension of the others

## Important Facts & Details
${facts.length > 0 ? facts.map(s => `• ${s.trim()}.`).join('\n') : sentences.slice(0, 4).map(s => `• ${s.trim()}.`).join('\n')}

## Current Applications & Relevance
• These topics have widespread applications in modern society and continue to influence current practices
• They play crucial roles in technological advancement, education, and professional development
• Their principles are applied across multiple industries and academic disciplines

## Significance & Future Implications
These interconnected topics represent essential knowledge areas that continue to evolve and shape our understanding of complex systems, driving innovation and informing future developments in their respective fields.`;
    } else {
      return `## Executive Summary
${title} represents a significant and multifaceted topic that plays an important role in its field and has substantial relevance to contemporary understanding and applications.

## Core Definition & Key Characteristics
${definitions.length > 0 ? definitions.map(s => `• ${s.trim()}.`).join('\n') : `• ${title} encompasses several key characteristics and properties that distinguish it within its domain\n• It involves specific principles and methodologies that are fundamental to its understanding`}

## Historical Background & Origins
${historical.length > 0 ? historical.map(s => `• ${s.trim()}.`).join('\n') : '• This topic has developed through historical evolution and contributions from various scholars and practitioners\n• Its foundations were established through systematic study and practical application over time'}

## Main Categories & Classifications
• This topic can be understood through various perspectives and classifications
• Different approaches and methodologies contribute to its comprehensive understanding
• Multiple sub-areas and specializations exist within this broader domain

## Important Facts & Statistics
${facts.length > 0 ? facts.map(s => `• ${s.trim()}.`).join('\n') : sentences.slice(0, 4).map(s => `• ${s.trim()}.`).join('\n')}

## Current Applications & Uses
• This topic has practical applications in multiple contexts and industries
• It influences contemporary practices and technological developments
• Professional and academic communities actively utilize its principles and methodologies

## Significance & Impact
${title} continues to be highly relevant due to its fundamental importance, practical applications, and ongoing influence on related fields. Its principles and insights contribute to advancing knowledge and addressing contemporary challenges in its domain.`;
    }
  }
  
  function enhanceAndExpandSummaryStructure(summary, title, originalContent) {
    // Clean up the summary
    summary = summary.replace(/^\s*Summary:?\s*/i, '').trim();
    
    // Ensure proper section formatting with better patterns
    summary = summary.replace(/^([A-Z][A-Za-z\s&,]+)[:.]?\s*$/gm, '## $1');
    summary = summary.replace(/^(\*\*[^*]+\*\*)/gm, '## $1');
    summary = summary.replace(/^#{1,2}\s*([^#\n]+)/gm, '## $1');
    
    // Convert various bullet point formats to consistent format
    summary = summary.replace(/^[-*•·]\s*/gm, '• ');
    summary = summary.replace(/^\d+\.\s*/gm, '• ');
    
    // Improve paragraph and section spacing
    summary = summary.replace(/\n\n\n+/g, '\n\n');
    summary = summary.replace(/^##\s*(.+)\n([^#•])/gm, '## $1\n\n$2');
    
    // Ensure minimum content standards for each section
    const sections = summary.split(/^## /gm).filter(s => s.trim());
    const enhancedSections = [];
    
    for (let section of sections) {
      const lines = section.split('\n').filter(l => l.trim());
      if (lines.length === 0) continue;
      
      const sectionTitle = lines[0].trim();
      const sectionContent = lines.slice(1).join('\n').trim();
      
      // If section is too short, try to enhance it
      if (sectionContent.length < 50) {
        const enhancedContent = enhanceSectionContent(sectionTitle, sectionContent, originalContent, title);
        enhancedSections.push(`## ${sectionTitle}\n\n${enhancedContent}`);
      } else {
        enhancedSections.push(`## ${sectionTitle}\n\n${sectionContent}`);
      }
    }
    
    // If no sections found, create basic structure
    if (enhancedSections.length === 0) {
      summary = `## Executive Summary\n\n${summary}`;
    } else {
      summary = enhancedSections.join('\n\n');
    }
    
    // Final cleanup
    summary = summary.replace(/\n{3,}/g, '\n\n');
    summary = summary.replace(/•\s*•/g, '•');
    
    return summary;
  }
  
  function enhanceSectionContent(sectionTitle, content, originalContent, title) {
    // If content is very minimal, try to extract relevant information from original content
    if (!content || content.length < 20) {
      const titleLower = sectionTitle.toLowerCase();
      const sentences = originalContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
      
      let relevantSentences = [];
      
      if (titleLower.includes('executive') || titleLower.includes('summary') || titleLower.includes('overview')) {
        relevantSentences = sentences.slice(0, 2);
      } else if (titleLower.includes('historical') || titleLower.includes('background') || titleLower.includes('origin')) {
        relevantSentences = sentences.filter(s => 
          /\b(century|era|period|ancient|medieval|modern|history|historical|originally|first|began|started|founded|established|created)\b/i.test(s)
        ).slice(0, 2);
      } else if (titleLower.includes('fact') || titleLower.includes('statistic') || titleLower.includes('detail')) {
        relevantSentences = sentences.filter(s => 
          /\b\d{4}\b|\b\d+[,.]?\d*\s*(percent|%|million|billion|thousand|meters?|feet|miles|kg|pounds)\b/i.test(s)
        ).slice(0, 3);
      } else if (titleLower.includes('definition') || titleLower.includes('concept') || titleLower.includes('characteristic')) {
        relevantSentences = sentences.filter(s => 
          /\bis\s+(a|an|the)|\bdefines?\b|\bknown\s+as\b|\brefers?\s+to\b|\bcharacterized\s+by\b/i.test(s)
        ).slice(0, 2);
      } else if (titleLower.includes('application') || titleLower.includes('use') || titleLower.includes('relevance')) {
        relevantSentences = sentences.filter(s => 
          /\b(used|applied|utilize|employ|practice|implementation|application|relevant|important|significant)\b/i.test(s)
        ).slice(0, 2);
      } else {
        relevantSentences = sentences.slice(0, 2);
      }
      
      if (relevantSentences.length > 0) {
        return relevantSentences.map(s => `• ${s.trim()}.`).join('\n');
      } else {
        return `• This section provides important information about ${title} related to ${sectionTitle.toLowerCase()}.`;
      }
    }
    
    return content;
  }
  
  async function handleMultipleUrls(req, res) {
    try {
      const { urls, length = 'short' } = req.body;
  
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ 
          error: 'Please provide an array of Wikipedia URLs.' 
        });
      }
  
      if (urls.length > 10) {
        return res.status(400).json({ 
          error: 'Maximum 10 URLs allowed per request.' 
        });
      }
  
      // Validate all URLs
      const invalidUrls = urls.filter(url => !url.includes('wikipedia.org/wiki/'));
      if (invalidUrls.length > 0) {
        return res.status(400).json({ 
          error: `Invalid Wikipedia URLs found: ${invalidUrls.length} URLs are not valid Wikipedia articles.` 
        });
      }
  
      const summaryParams = getSummaryParameters(length);
      const articles = [];
      const failedUrls = [];
  
      // Fetch content for all URLs
      console.log(`Fetching content for ${urls.length} articles...`);
      
      for (const url of urls) {
        try {
          const article = await fetchWikipediaContent(url);
          articles.push(article);
          console.log(`Successfully fetched: ${article.title}`);
        } catch (error) {
          console.error(`Failed to fetch ${url}:`, error.message);
          failedUrls.push({ url, error: error.message });
        }
      }
  
      if (articles.length === 0) {
        return res.status(404).json({ 
          error: 'No articles could be retrieved. Please check your URLs and try again.' 
        });
      }
  
      // Combine all content
      const combinedContent = articles.map(article => {
        return `## ${article.title}\n\n${article.content}`;
      }).join('\n\n---\n\n');
  
      console.log(`Combined content length: ${combinedContent.length} characters`);
  
      // Generate a unified summary
      const combinedTitle = articles.map(a => a.title).join(', ');
      
      // For multiple articles, we need a longer summary to cover all topics
      const multiSummaryParams = {
        max_length: Math.min(summaryParams.max_length * 1.5, 500),
        min_length: Math.max(summaryParams.min_length * 1.2, 100)
      };
  
      let unifiedSummary;
      try {
        // Try to generate a unified summary
        unifiedSummary = await generateSummary(combinedContent, combinedTitle, multiSummaryParams);
      } catch (error) {
        console.error('Failed to generate unified summary:', error.message);
        
        // Fallback: Generate individual summaries and combine them
        console.log('Falling back to individual summaries...');
        const individualSummaries = [];
        
        for (const article of articles) {
          try {
            const summary = await generateSummary(article.content, article.title, summaryParams);
            individualSummaries.push(`**${article.title}:** ${summary}`);
          } catch (err) {
            console.error(`Failed to summarize ${article.title}:`, err.message);
            individualSummaries.push(`**${article.title}:** Unable to generate summary.`);
          }
        }
        
        unifiedSummary = individualSummaries.join('\n\n');
      }
  
      const response = {
        summary: unifiedSummary,
        titles: articles.map(a => a.title),
        urls: articles.map(a => a.url),
        successCount: articles.length,
        totalCount: urls.length,
        length: length,
        wordCount: unifiedSummary.split(/\s+/).length
      };
  
      if (failedUrls.length > 0) {
        response.warnings = failedUrls.map(f => f.error);
      }
  
      return res.status(200).json(response);
  
    } catch (error) {
      console.error('Error in handleMultipleUrls:', error);
      
      if (error.message.includes('API key')) {
        return res.status(500).json({ 
          error: 'AI service configuration error. Please contact support.' 
        });
      }
      
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return res.status(429).json({ 
          error: 'AI service temporarily overloaded. Please try again in a few moments.' 
        });
      }
  
      return res.status(500).json({ 
        error: error.message || 'An unexpected error occurred while processing multiple articles.'
      });
    }
  }
  
  async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { url, length = 'short' } = req.body;
  
      if (!url || !url.includes('wikipedia.org/wiki/')) {
        return res.status(400).json({ 
          error: 'Invalid Wikipedia URL. Please provide a valid Wikipedia article URL.' 
        });
      }
  
      const summaryParams = getSummaryParameters(length);
      
      // Fetch the article content
      const article = await fetchWikipediaContent(url);
      
      // Generate summary
      const summary = await generateSummary(article.content, article.title, summaryParams);
  
      return res.status(200).json({
        summary,
        title: article.title,
        originalUrl: url,
        length: length,
        wordCount: summary.split(/\s+/).length
      });
  
    } catch (error) {
      console.error('Error:', error);
      
      if (error.message.includes('API key')) {
        return res.status(500).json({ 
          error: 'AI service configuration error. Please contact support.' 
        });
      }
      
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return res.status(429).json({ 
          error: 'AI service temporarily overloaded. Please try again in a few moments.' 
        });
      }
      
      if (error.message.includes('timeout')) {
        return res.status(408).json({ 
          error: 'Request timed out. Please try again with a shorter article.' 
        });
      }
  
      return res.status(500).json({ 
        error: error.message || 'An unexpected error occurred while generating the summary.'
      });
    }
  }

  module.exports = { 
    default: handler,
    handleMultipleUrls: handleMultipleUrls
  };