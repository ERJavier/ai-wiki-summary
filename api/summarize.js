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
        // Create study guide-focused prompts
        const isMultipleArticles = title.includes(',');
        let promptText;
        
        if (isMultipleArticles) {
          promptText = `Create a comprehensive STUDY GUIDE for these Wikipedia topics: ${title}. Format this as an educational study resource with these sections:

## 🎯 Learning Objectives
List 3-4 clear learning goals - what students should understand after studying these topics.

## 📚 Key Terms & Definitions
Define the most important terms, concepts, and vocabulary. Use bullet points with term: definition format.

## 🏛️ Historical Context & Timeline
Present important dates, periods, developments, and key figures in chronological order where relevant.

## 🔍 Core Concepts Explained
Break down the main ideas into digestible explanations. Use examples and analogies where helpful.

## 🔗 Connections & Relationships
Explain how these topics relate to each other and to broader themes. Include cause-and-effect relationships.

## 📊 Important Facts & Data
List crucial statistics, measurements, dates, and quantifiable information that students should memorize.

## 💡 Real-World Applications
Describe practical uses, current examples, and how these topics apply in daily life or professional contexts.

## 🎓 Study Tips & Key Takeaways
Provide memorable insights, patterns to remember, and the most important points for exam preparation.

## ❓ Review Questions
Suggest 2-3 study questions students should be able to answer after learning this material.

Content to analyze:
${truncatedContent}

Write in clear, educational language suitable for studying. Use specific examples, memorable details, and structure information for easy review and retention.`;
        } else {
          promptText = `Create a comprehensive STUDY GUIDE for this Wikipedia topic: ${title}. Format this as an educational study resource with these sections:

## 🎯 Learning Objectives
List 3-4 clear learning goals - what students should understand after studying this topic.

## 📚 Key Terms & Definitions
Define the most important terms and concepts. Present as: Term: Clear, concise definition.

## 🏛️ Historical Background
Present the origin, development, and key historical milestones. Include important dates and figures.

## 🔍 Core Concepts Explained
Break down the main ideas into clear, understandable explanations. Use examples and analogies.

## 📂 Categories & Classifications
If applicable, organize different types, branches, or classifications within this topic.

## 📊 Important Facts & Data
List crucial statistics, dates, measurements, and quantifiable information students should know.

## 💡 Real-World Applications
Describe how this topic is used today, with specific examples and practical applications.

## 🎯 Significance & Impact
Explain why this topic is important and its broader impact on society, science, or culture.

## 🎓 Study Tips & Key Takeaways
Provide the most important points to remember and effective ways to study this material.

## ❓ Review Questions
Suggest 3-4 study questions students should be able to answer to demonstrate understanding.

Content to analyze:
${truncatedContent}

Write in clear, educational language perfect for studying. Include memorable details, specific examples, and organize information for easy review and retention.`;
        }
        
        const result = await queryHuggingFace({
          inputs: promptText,
          parameters: {
            max_length: Math.max(summaryParams.max_length * 3, 700), // Increased for study guide format
            min_length: Math.max(summaryParams.min_length * 2.5, 250),
            do_sample: true,
            temperature: 0.25, // Lower for more focused, educational content
            repetition_penalty: 1.4, // Higher to avoid repetition
            length_penalty: 1.2, // Encourage comprehensive responses
            top_p: 0.85,
            num_beams: 5
          }
        }, model);
  
        if (result && result[0]) {
          if (result[0].summary_text) {
            summary = result[0].summary_text;
            break;
          } else if (result[0].generated_text) {
            let generatedText = result[0].generated_text;
            // Clean up the generated text
            const summaryStart = generatedText.toLowerCase().indexOf('learning objectives');
            if (summaryStart !== -1) {
              generatedText = generatedText.substring(summaryStart - 5).trim();
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
      // Enhanced fallback: create a study guide structured summary from the content
      console.log('All AI models failed, creating study guide fallback summary...');
      summary = createStudyGuideFallback(truncatedContent, title, isMultipleArticles);
    }
  
    // Post-process the summary for better study guide structure
    summary = enhanceStudyGuideStructure(summary, title, truncatedContent);
    
    return summary;
  }
  
     function createStudyGuideFallback(content, title, isMultiple) {
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
       return `## 🎯 Learning Objectives
• Understand the core concepts and principles of ${topics.join(' and ')}
• Identify the key relationships and connections between these topics
• Analyze the historical development and current applications
• Evaluate the significance and impact in their respective fields

## 📚 Key Terms & Definitions
${definitions.length > 0 ? definitions.map(s => `• ${extractKeyTerm(s)}: ${s.trim()}`).join('\n') : '• These topics encompass fundamental concepts that are essential for understanding their respective domains'}

## 🏛️ Historical Context & Timeline
${historical.length > 0 ? historical.map(s => `• ${s.trim()}`).join('\n') : '• These subjects have evolved over time through various historical developments and contributions from numerous scholars and practitioners'}

## 🔍 Core Concepts Explained
• These topics are interconnected through shared principles, methodologies, and applications
• They influence each other through cross-disciplinary research and practical implementations
• Understanding one enhances comprehension of the others

## 📊 Important Facts & Data
${facts.length > 0 ? facts.map(s => `• ${s.trim()}`).join('\n') : sentences.slice(0, 4).map(s => `• ${s.trim()}`).join('\n')}

## 💡 Real-World Applications
• These topics have widespread applications in modern society and continue to influence current practices
• They play crucial roles in technological advancement, education, and professional development
• Their principles are applied across multiple industries and academic disciplines

## 🎓 Study Tips & Key Takeaways
• Focus on understanding the connections between these related topics
• Create concept maps to visualize relationships and hierarchies
• Practice explaining concepts in your own words to ensure comprehension

## ❓ Review Questions
• How do these topics interconnect and influence each other?
• What are the most significant historical developments in these areas?
• How are these concepts applied in real-world scenarios today?`;
     } else {
       return `## 🎯 Learning Objectives
• Define and explain the core concepts of ${title}
• Understand the historical development and key milestones
• Identify important facts, data, and characteristics
• Analyze real-world applications and significance

## 📚 Key Terms & Definitions
${definitions.length > 0 ? definitions.map(s => `• ${extractKeyTerm(s)}: ${s.trim()}`).join('\n') : `• ${title}: Key characteristics and properties that distinguish it within its domain\n• Related concepts and methodologies fundamental to understanding`}

## 🏛️ Historical Background
${historical.length > 0 ? historical.map(s => `• ${s.trim()}`).join('\n') : '• This topic has developed through historical evolution and contributions from various scholars and practitioners\n• Its foundations were established through systematic study and practical application over time'}

## 🔍 Core Concepts Explained
• This topic can be understood through various perspectives and classifications
• Different approaches and methodologies contribute to its comprehensive understanding
• Multiple sub-areas and specializations exist within this broader domain

## 📊 Important Facts & Data
${facts.length > 0 ? facts.map(s => `• ${s.trim()}`).join('\n') : sentences.slice(0, 4).map(s => `• ${s.trim()}`).join('\n')}

## 💡 Real-World Applications
• This topic has practical applications in multiple contexts and industries
• It influences contemporary practices and technological developments
• Professional and academic communities actively utilize its principles and methodologies

## 🎯 Significance & Impact
• ${title} continues to be highly relevant due to its fundamental importance
• It has practical applications and ongoing influence on related fields
• Its principles contribute to advancing knowledge and addressing contemporary challenges

## 🎓 Study Tips & Key Takeaways
• Break down complex concepts into smaller, manageable parts
• Use examples and analogies to better understand abstract ideas
• Connect new information to what you already know

## ❓ Review Questions
• What are the key defining characteristics of this topic?
• How has this topic evolved historically?
• What are the most important real-world applications?
• Why is this topic significant in its field?`;
     }
   }
   
   function extractKeyTerm(sentence) {
     // Try to extract the main term from a definition sentence
     const match = sentence.match(/^([^,.:]+)(?:\s+is\s+|\s+are\s+|\s+refers?\s+to\s+|\s+means?\s+)/i);
     return match ? match[1].trim() : sentence.split(' ').slice(0, 3).join(' ');
   }
  
  function enhanceStudyGuideStructure(summary, title, originalContent) {
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
      summary = `## 🎯 Learning Objectives\n\n${summary}`;
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
      
             if (titleLower.includes('learning objectives') || titleLower.includes('overview')) {
         return `• Understand the core concepts and principles of ${title}\n• Identify key characteristics and important features\n• Analyze the significance and applications\n• Evaluate the impact and relevance in its field`;
       } else if (titleLower.includes('key terms') || titleLower.includes('definition') || titleLower.includes('concept')) {
         const terms = sentences.filter(s => 
           /\bis\s+(a|an|the)|\bdefines?\b|\bknown\s+as\b|\brefers?\s+to\b|\bcharacterized\s+by\b/i.test(s)
         ).slice(0, 3);
         return terms.length > 0 ? terms.map(s => `• ${extractKeyTerm(s)}: ${s.trim()}`).join('\n') : `• ${title}: Key characteristics and properties that distinguish it within its domain`;
       } else if (titleLower.includes('historical') || titleLower.includes('background') || titleLower.includes('origin')) {
         relevantSentences = sentences.filter(s => 
           /\b(century|era|period|ancient|medieval|modern|history|historical|originally|first|began|started|founded|established|created)\b/i.test(s)
         ).slice(0, 3);
       } else if (titleLower.includes('fact') || titleLower.includes('statistic') || titleLower.includes('data')) {
         relevantSentences = sentences.filter(s => 
           /\b\d{4}\b|\b\d+[,.]?\d*\s*(percent|%|million|billion|thousand|meters?|feet|miles|kg|pounds)\b/i.test(s)
         ).slice(0, 4);
       } else if (titleLower.includes('application') || titleLower.includes('use') || titleLower.includes('relevance')) {
         relevantSentences = sentences.filter(s => 
           /\b(used|applied|utilize|employ|practice|implementation|application|relevant|important|significant)\b/i.test(s)
         ).slice(0, 3);
       } else if (titleLower.includes('study tips') || titleLower.includes('takeaways')) {
         return `• Break down complex concepts into smaller, manageable parts\n• Use examples and analogies to better understand abstract ideas\n• Connect new information to what you already know\n• Practice explaining concepts in your own words`;
       } else if (titleLower.includes('review questions') || titleLower.includes('questions')) {
         return `• What are the key defining characteristics of this topic?\n• How has this topic evolved historically?\n• What are the most important real-world applications?\n• Why is this topic significant in its field?`;
       } else {
         relevantSentences = sentences.slice(0, 3);
       }
       
       if (relevantSentences.length > 0) {
         return relevantSentences.map(s => `• ${s.trim()}`).join('\n');
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