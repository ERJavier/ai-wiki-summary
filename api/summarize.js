// api/summarize.js 

// Advanced content analysis for optimized summarization
function analyzeContentComplexity(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const technicalTerms = content.match(/[A-Z][a-z]*(?:\s+[A-Z][a-z]*)*(?:\s+\([^)]+\))?/g) || [];
    const numericalData = content.match(/\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand|percent|%|years?|km|miles?))?/gi) || [];
    
    return {
        complexity: avgSentenceLength > 100 ? 'high' : avgSentenceLength > 60 ? 'medium' : 'low',
        technicalDensity: technicalTerms.length / sentences.length,
        dataRichness: numericalData.length / sentences.length,
        contentType: determineContentType(content)
    };
}

function determineContentType(content) {
    const patterns = {
        biography: /\b(?:born|died|life|career|education|early life|personal|family)\b/gi,
        history: /\b(?:century|war|battle|empire|dynasty|ancient|medieval|founded|established)\b/gi,
        science: /\b(?:theory|research|discovery|experiment|hypothesis|molecule|atom|equation)\b/gi,
        geography: /\b(?:located|climate|population|capital|region|mountain|river|border)\b/gi,
        technology: /\b(?:developed|invented|software|hardware|algorithm|computer|digital)\b/gi,
        culture: /\b(?:tradition|festival|art|music|literature|religion|language|custom)\b/gi
    };
    
    let maxScore = 0;
    let detectedType = 'general';
    
    for (const [type, pattern] of Object.entries(patterns)) {
        const matches = content.match(pattern) || [];
        const score = matches.length;
        if (score > maxScore) {
            maxScore = score;
            detectedType = type;
        }
    }
    
    return detectedType;
}

function extractSemanticClusters(contents) {
    // Group related topics by semantic similarity
    const clusters = [];
    const processed = new Set();
    
    for (let i = 0; i < contents.length; i++) {
        if (processed.has(i)) continue;
        
        const cluster = {
            articles: [contents[i]],
            indices: [i],
            theme: determineContentType(contents[i].content),
            connections: []
        };
        
        // Find related articles
        for (let j = i + 1; j < contents.length; j++) {
            if (processed.has(j)) continue;
            
            const similarity = calculateContentSimilarity(contents[i].content, contents[j].content);
            if (similarity > 0.3) {
                cluster.articles.push(contents[j]);
                cluster.indices.push(j);
                processed.add(j);
            }
        }
        
        clusters.push(cluster);
        processed.add(i);
    }
    
    return clusters;
}

function calculateContentSimilarity(content1, content2) {
    // Simple keyword-based similarity calculation
    const words1 = new Set(content1.toLowerCase().match(/\b\w{4,}\b/g) || []);
    const words2 = new Set(content2.toLowerCase().match(/\b\w{4,}\b/g) || []);
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}

function optimizeContentForSummarization(content, maxLength = 8000) {
    // Enhanced content optimization that preserves key information
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    const scored = paragraphs.map(paragraph => ({
        text: paragraph,
        score: scoreParagraphImportance(paragraph)
    }));
    
    // Sort by importance and select top paragraphs
    scored.sort((a, b) => b.score - a.score);
    
    let optimizedContent = '';
    let currentLength = 0;
    
    for (const para of scored) {
        if (currentLength + para.text.length > maxLength) break;
        optimizedContent += para.text + '\n\n';
        currentLength += para.text.length;
    }
    
    return optimizedContent.trim();
}

function scoreParagraphImportance(paragraph) {
    // Score based on multiple factors
    let score = 0;
    
    // Length factor (medium-length paragraphs are often most informative)
    const length = paragraph.length;
    if (length > 100 && length < 500) score += 2;
    else if (length > 50) score += 1;
    
    // Key information indicators
    const keyPatterns = [
        /\b(?:important|significant|major|key|primary|main|central|crucial)\b/gi,
        /\b(?:known for|famous for|notable|recognized)\b/gi,
        /\b(?:established|founded|created|developed|invented)\b/gi,
        /\d{4}|\d+(?:th|st|nd|rd)\s+century/g, // dates
        /\b(?:million|billion|thousand)\b/gi, // large numbers
    ];
    
    keyPatterns.forEach(pattern => {
        const matches = paragraph.match(pattern) || [];
        score += matches.length;
    });
    
    // Avoid pure lists or very short statements
    if (paragraph.split(/[.!?]/).length < 2) score -= 1;
    
    return score;
}

async function queryOpenRouter(messages, model) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://localhost:3000', // Optional: for app identification
            'X-Title': 'AI Wikipedia Summarizer', // Optional: for app identification
        },
        method: 'POST',
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.25,
            max_tokens: 2000,
            top_p: 0.85,
            frequency_penalty: 0.3,
            presence_penalty: 0.2
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${error}`);
    }
    
    return response.json();
}

function getSummaryParameters(length) {
    const params = {
        short: { max_tokens: 400, target_words: "200-300" },
        medium: { max_tokens: 800, target_words: "400-600" },
        long: { max_tokens: 1200, target_words: "600-900" }
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
    // Increase content length for better context
    const maxInputLength = 6000; // Increased from 4000
    const truncatedContent = content.length > maxInputLength 
        ? content.substring(0, maxInputLength) + '...'
        : content;

         // Generate summary using OpenRouter
     const models = [
         'mistralai/mistral-small-3.2-24b-instruct:free'
     ];

    let summary = null;
    let lastError = null;

    for (const model of models) {
        try {
            // Create enhanced study guide-focused prompts
            const isMultipleArticles = title.includes(',');
            let promptText;
            
                         if (isMultipleArticles) {
                promptText = `Create an EXCEPTIONAL and COMPREHENSIVE study guide for these Wikipedia topics: ${title}

Transform this into an engaging, educational masterpiece that goes beyond basic summaries. Use vivid examples, clear explanations, and memorable details that make learning enjoyable and effective.

## 🎯 Learning Objectives
Create 4-5 specific, measurable learning goals that clearly state what students will master. Use action verbs like "analyze," "evaluate," "synthesize," and "compare."

## 📚 Key Terms & Definitions
Provide crystal-clear definitions with context and examples. Format as:
• **Term**: Comprehensive definition with real-world context and why it matters

## 🏛️ Historical Context & Timeline
Present a compelling narrative of development with:
• Specific dates and pivotal moments
• Key figures and their contributions
• Cause-and-effect relationships
• How events shaped current understanding

## 🔍 Core Concepts Deep Dive
Break down complex ideas into accessible explanations:
• Use analogies and metaphors to clarify difficult concepts
• Provide concrete examples from daily life
• Explain the "why" behind each concept, not just the "what"
• Connect abstract ideas to practical applications

## 🔗 Interconnections & Synthesis
Reveal the fascinating relationships between topics:
• How concepts influence and build upon each other
• Cross-disciplinary connections and applications
• Patterns and themes that emerge across topics
• Contemporary relevance and future implications

## 📊 Essential Facts & Data
Present crucial information in memorable ways:
• Statistics with context and significance
• Comparisons that help visualize scale
• Trends and patterns over time
• Quantitative data that tells a story

## 💡 Real-World Impact & Applications
Showcase current, relevant applications with specific examples:
• Modern innovations and technologies
• Professional and career applications
• Societal benefits and challenges
• Future possibilities and ongoing research

## 🎓 Advanced Study Strategies
Provide sophisticated learning techniques:
• Memory aids and mnemonics for complex information
• Effective practice methods and self-testing approaches
• Ways to connect new knowledge to existing understanding
• Critical thinking questions that deepen comprehension

## ❓ Thought-Provoking Review Questions
Design questions that require higher-order thinking:
• Analysis and evaluation questions
• Synthesis and application challenges
• Compare-and-contrast scenarios
• Problem-solving applications

Content to analyze:
${truncatedContent}

Write with enthusiasm and clarity. Use specific examples, fascinating details, and create content that students will actually want to read and remember. Aim for ${summaryParams.target_words} words of engaging, educational content.`;
             } else {
                promptText = `Create an EXCEPTIONAL and COMPREHENSIVE study guide for: ${title}

Transform this Wikipedia content into an engaging, memorable educational resource that makes learning exciting and effective. Use vivid examples, clear explanations, and fascinating details.

## 🎯 Learning Objectives
Write 4-5 specific, actionable learning goals using precise verbs like "analyze," "evaluate," "synthesize," and "apply." Make each objective clear and measurable.

## 📚 Key Terms & Definitions
Provide comprehensive definitions with context:
• **Term**: Clear definition + why it matters + example or analogy
Focus on terms students must understand to master this topic.

## 🏛️ Historical Development & Timeline
Tell the compelling story of how this topic evolved:
• Origins and founding moments with specific dates
• Key breakthroughs and discoveries
• Influential figures and their unique contributions
• How past events shape current understanding

## 🔍 Core Concepts Masterclass
Make complex ideas accessible and memorable:
• Use powerful analogies and real-world comparisons
• Explain the underlying "why" behind each concept
• Provide concrete examples students can visualize
• Break down abstract ideas into digestible components

## 📂 Classification & Organization
Structure the topic's complexity clearly:
• Main categories and subcategories
• Different approaches or schools of thought
• Hierarchical relationships and dependencies
• How experts organize and think about this field

## 📊 Critical Facts & Data
Present essential information memorably:
• Key statistics with context and significance
• Important dates, measurements, and quantities
• Comparisons that help visualize scale and importance
• Trends and patterns that reveal deeper truths

## 💡 Modern Applications & Relevance
Showcase how this topic impacts today's world:
• Current technologies and innovations
• Professional and career connections
• Societal benefits and ongoing challenges
• Cutting-edge research and future possibilities

## 🎯 Significance & Broader Impact
Explain why this topic truly matters:
• Its role in advancing human knowledge
• Connections to other important fields
• Cultural, social, or scientific implications
• How it shapes our understanding of the world

## 🎓 Master-Level Study Techniques
Provide sophisticated learning strategies:
• Effective memorization techniques for key information
• Critical thinking approaches for deeper understanding
• Ways to connect this topic to other knowledge
• Self-assessment methods to test comprehension

## ❓ Comprehensive Review Challenge
Create questions that test true understanding:
• Analysis questions requiring deep thinking
• Application scenarios using real-world examples
• Synthesis challenges connecting multiple concepts
• Evaluation questions requiring informed judgment

Content to analyze:
${truncatedContent}

Write with passion and precision. Include fascinating details, memorable examples, and create content that transforms studying from a chore into an adventure. Make every section informative, engaging, and genuinely helpful for mastering this topic. Aim for ${summaryParams.target_words} words.`;
             }
            
            const result = await queryOpenRouter([{ role: "user", content: promptText }], model);

            if (result && result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
                summary = result.choices[0].message.content;
                break;
            }
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    if (!summary) {
        // Enhanced fallback with much better content extraction
        console.log('All AI models failed, creating enhanced study guide fallback summary...');
        summary = createEnhancedStudyGuideFallback(truncatedContent, title, isMultipleArticles);
    }

    // Enhanced post-processing for better structure and content
    summary = enhanceAndPolishSummary(summary, title, truncatedContent);
    
    return summary;
}

// Enhanced fallback function with sophisticated content analysis
function createEnhancedStudyGuideFallback(content, title, isMultiple) {
    // Advanced content analysis
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 25);
    const words = content.toLowerCase().split(/\s+/);
    
    // Sophisticated content extraction
    const importantFacts = extractImportantFacts(sentences);
    const keyTerms = extractKeyTermsAdvanced(sentences, title);
    const historicalInfo = extractHistoricalContext(sentences);
    const applications = extractApplications(sentences);
    const significance = extractSignificance(sentences, title);
    
    if (isMultiple) {
        const topics = title.split(', ');
        return createMultiTopicFallback(topics, importantFacts, keyTerms, historicalInfo, applications, significance);
    } else {
        return createSingleTopicFallback(title, importantFacts, keyTerms, historicalInfo, applications, significance);
    }
}

function extractImportantFacts(sentences) {
    const facts = [];
    
    // Numbers and statistics
    const numericalFacts = sentences.filter(s => 
        /\b\d{1,4}[,.]?\d*\s*(percent|%|million|billion|thousand|meters?|feet|miles|kg|pounds|years?|degrees?)\b/i.test(s) ||
        /\b(founded|established|created|built|invented|discovered)\s+in\s+\d{4}\b/i.test(s) ||
        /\b\d{4}[-–]\d{4}\b|\b\d{1,2}(st|nd|rd|th)\s+century\b/i.test(s)
    ).slice(0, 5);
    
    // Important achievements and milestones
    const achievements = sentences.filter(s => 
        /\b(first|largest|biggest|most|highest|deepest|fastest|oldest|newest|award|prize|breakthrough|achievement)\b/i.test(s) &&
        !/\b(some|many|several|various)\b/i.test(s)
    ).slice(0, 3);
    
    return [...numericalFacts, ...achievements].slice(0, 6);
}

function extractKeyTermsAdvanced(sentences, title) {
    const terms = [];
    
    // Direct definitions
    const definitions = sentences.filter(s => 
        /\b(is|are)\s+(a|an|the)\b.*\b(type|kind|form|method|process|system|theory|concept)\b/i.test(s) ||
        /\bknown\s+as\b|\brefers?\s+to\b|\bdefines?\b|\bmeans?\b/i.test(s) ||
        /\b(called|termed|named)\b.*\b(because|due\s+to|owing\s+to)\b/i.test(s)
    ).slice(0, 4);
    
    // Technical terms and concepts
    const technical = sentences.filter(s => 
        /\b(consists?\s+of|comprises?|includes?|contains?)\b/i.test(s) ||
        /\b(characterized\s+by|distinguished\s+by|notable\s+for)\b/i.test(s)
    ).slice(0, 3);
    
    return [...definitions, ...technical].slice(0, 5);
}

function extractHistoricalContext(sentences) {
    const historical = [];
    
    // Timeline events
    const timeline = sentences.filter(s => 
        /\b\d{4}\b.*\b(began|started|founded|established|created|invented|discovered|built)\b/i.test(s) ||
        /\b(during|in)\s+the\s+\d+(st|nd|rd|th)?\s+century\b/i.test(s) ||
        /\b(ancient|medieval|renaissance|industrial|modern|contemporary)\b.*\b(period|era|age|times?)\b/i.test(s)
    ).slice(0, 4);
    
    // Key figures and influences
    const figures = sentences.filter(s => 
        /\b(developed\s+by|created\s+by|invented\s+by|founded\s+by)\b/i.test(s) ||
        /\b(scientist|researcher|inventor|founder|pioneer|scholar)\b/i.test(s)
    ).slice(0, 3);
    
    return [...timeline, ...figures].slice(0, 5);
}

function extractApplications(sentences) {
    return sentences.filter(s => 
        /\b(used\s+(for|in|to)|applied\s+(in|to)|helps?\s+(to|with))\b/i.test(s) ||
        /\b(applications?|uses?|purposes?|benefits?|advantages?)\b/i.test(s) ||
        /\b(today|currently|modern|contemporary|present)\b.*\b(use|usage|application|practice)\b/i.test(s) ||
        /\b(industry|industries|field|fields|sector|sectors)\b/i.test(s)
    ).slice(0, 4);
}

function extractSignificance(sentences, title) {
    return sentences.filter(s => 
        /\b(important|significant|crucial|essential|vital|critical|key)\b/i.test(s) ||
        /\b(impact|influence|effect|contribution|role)\b.*\b(on|in|to)\b/i.test(s) ||
        /\b(revolutionized|transformed|changed|advanced|improved)\b/i.test(s)
    ).slice(0, 3);
}

function createMultiTopicFallback(topics, facts, terms, historical, applications, significance) {
    return `## 🎯 Learning Objectives
• **Analyze** the fundamental principles and methodologies underlying ${topics.slice(0, 2).join(' and ')}${topics.length > 2 ? ' and related topics' : ''}
• **Evaluate** the interconnections and cross-disciplinary relationships between these subjects
• **Synthesize** historical developments with contemporary applications and future implications
• **Apply** key concepts to solve problems and understand real-world scenarios
• **Compare** different approaches, theories, and methodologies within these domains

## 📚 Key Terms & Definitions
${terms.length > 0 ? terms.map(s => `• **${extractKeyTerm(s)}**: ${s.trim()}`).join('\n') : 
topics.map(topic => `• **${topic}**: A fundamental concept with significant theoretical and practical implications in its field`).join('\n')}

## 🏛️ Historical Context & Timeline
${historical.length > 0 ? historical.map(s => `• ${enhanceHistoricalPoint(s)}`).join('\n') : 
`• These fields have evolved through centuries of scholarly research and practical innovation
• Key developments occurred during major historical periods, each building upon previous knowledge
• Modern understanding reflects contributions from diverse cultures and intellectual traditions`}

## 🔍 Core Concepts Deep Dive
• **Foundational Principles**: These topics share common theoretical frameworks and methodological approaches
• **Interconnected Systems**: Understanding one area enhances comprehension of related concepts and applications
• **Hierarchical Organization**: Complex ideas build from simpler components, creating sophisticated knowledge structures
• **Cross-Disciplinary Integration**: These subjects influence and are influenced by multiple academic and professional fields

## 📊 Essential Facts & Data
${facts.length > 0 ? facts.map(s => `• ${enhanceFactualPoint(s)}`).join('\n') : 
`• These topics encompass quantifiable elements that demonstrate their scope and impact
• Statistical data reveals patterns and trends that inform current understanding
• Measurable outcomes provide evidence for theoretical principles and practical applications`}

## 💡 Real-World Impact & Applications
${applications.length > 0 ? applications.map(s => `• ${enhanceApplicationPoint(s)}`).join('\n') : 
`• Modern industries and technologies actively utilize principles from these fields
• Professional practices incorporate these concepts to solve complex contemporary challenges
• Innovation and advancement continue through practical application of theoretical knowledge`}

## 🎓 Advanced Study Strategies
• **Concept Mapping**: Create visual diagrams connecting ideas across different topics to reveal relationships
• **Comparative Analysis**: Systematically compare and contrast approaches, theories, and applications
• **Case Study Method**: Examine real-world examples to understand practical implementation of concepts
• **Synthesis Exercises**: Combine knowledge from multiple areas to address complex, multifaceted problems

## ❓ Thought-Provoking Review Questions
• How do the fundamental principles of these topics complement and enhance each other?
• What historical developments were crucial in shaping current understanding, and why?
• In what ways do these concepts address contemporary global challenges and opportunities?
• How might future developments in these fields transform current practices and understanding?`;
}

function createSingleTopicFallback(title, facts, terms, historical, applications, significance) {
    return `## 🎯 Learning Objectives
• **Define** and explain the fundamental concepts, principles, and characteristics of ${title}
• **Analyze** the historical development, key milestones, and evolutionary progression
• **Evaluate** the significance, impact, and contemporary relevance in its field
• **Apply** core principles to understand real-world scenarios and practical implementations
• **Synthesize** knowledge to make connections with related concepts and disciplines

## 📚 Key Terms & Definitions
${terms.length > 0 ? terms.map(s => `• **${extractKeyTerm(s)}**: ${s.trim()}`).join('\n') : 
`• **${title}**: ${generateGenericDefinition(title)}
• **Core Characteristics**: The distinctive features that define this topic within its domain
• **Methodological Approaches**: The systematic methods used to study and understand this subject`}

## 🏛️ Historical Development & Timeline
${historical.length > 0 ? historical.map(s => `• ${enhanceHistoricalPoint(s)}`).join('\n') : 
`• **Origins**: This topic emerged from systematic observation and scholarly inquiry over time
• **Key Developments**: Significant breakthroughs have shaped current understanding and applications
• **Evolution**: Continuous refinement through research and practical experience has advanced the field`}

## 🔍 Core Concepts Masterclass
• **Fundamental Principles**: The basic laws, rules, or theories that govern this topic's operation and understanding
• **Systematic Organization**: How experts categorize and structure knowledge within this field
• **Interconnected Elements**: The relationships between different components and sub-areas
• **Practical Implications**: How theoretical understanding translates into real-world applications

## 📊 Critical Facts & Data
${facts.length > 0 ? facts.map(s => `• ${enhanceFactualPoint(s)}`).join('\n') : 
`• **Quantitative Measures**: Key statistics and numerical data that characterize this topic
• **Comparative Context**: How this topic relates to others in terms of scale, importance, or impact
• **Temporal Patterns**: Changes and trends observed over time`}

## 💡 Modern Applications & Relevance
${applications.length > 0 ? applications.map(s => `• ${enhanceApplicationPoint(s)}`).join('\n') : 
`• **Contemporary Uses**: How this topic is actively applied in current professional and academic contexts
• **Technological Integration**: The role this topic plays in modern technological systems and innovations
• **Problem-Solving Applications**: Practical ways this knowledge addresses real-world challenges`}

## 🎯 Significance & Broader Impact
${significance.length > 0 ? significance.map(s => `• ${enhanceSignificancePoint(s)}`).join('\n') : 
`• **Academic Importance**: This topic contributes essential knowledge to its field and related disciplines
• **Practical Value**: Real-world applications demonstrate the utility and relevance of this knowledge
• **Future Potential**: Ongoing research and development continue to reveal new possibilities and applications`}

## 🎓 Master-Level Study Techniques
• **Deep Dive Analysis**: Examine each component systematically to build comprehensive understanding
• **Connection Building**: Link new knowledge to existing understanding and related topics
• **Application Practice**: Work through examples and scenarios to reinforce theoretical learning
• **Critical Evaluation**: Question assumptions and analyze evidence to develop analytical thinking

## ❓ Comprehensive Review Challenge
• What are the essential characteristics that distinguish this topic from related concepts?
• How has historical development influenced current understanding and practices?
• What evidence supports the significance and relevance of this topic in its field?
• How can the principles of this topic be applied to solve contemporary problems or challenges?`;
}

// Helper functions for enhancing content
function enhanceHistoricalPoint(sentence) {
    if (sentence.includes('century') || sentence.includes('founded') || sentence.includes('established')) {
        return sentence.trim();
    }
    return `Historical context: ${sentence.trim()}`;
}

function enhanceFactualPoint(sentence) {
    if (/\b\d/.test(sentence)) {
        return sentence.trim();
    }
    return `Key fact: ${sentence.trim()}`;
}

function enhanceApplicationPoint(sentence) {
    if (sentence.includes('used') || sentence.includes('applied') || sentence.includes('application')) {
        return sentence.trim();
    }
    return `Practical application: ${sentence.trim()}`;
}

function enhanceSignificancePoint(sentence) {
    if (sentence.includes('important') || sentence.includes('significant') || sentence.includes('impact')) {
        return sentence.trim();
    }
    return `Significance: ${sentence.trim()}`;
}

function generateGenericDefinition(title) {
    return `A comprehensive topic encompassing fundamental concepts, principles, and methodologies within its domain, characterized by specific features that distinguish it from related subjects.`;
}

function extractKeyTerm(sentence) {
    // Try to extract the main term from a definition sentence
    const match = sentence.match(/^([^,.:]+)(?:\s+is\s+|\s+are\s+|\s+refers?\s+to\s+|\s+means?\s+)/i);
    return match ? match[1].trim() : sentence.split(' ').slice(0, 3).join(' ');
}

function createEnhancedStudyGuideFallback(content, title, isMultiple) {
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
${definitions.length > 0 ? definitions.map(s => `• ${extractKeyTerm(s)}: ${s.trim()}`).join('\n') : `• ${title}: Key characteristics and properties that distinguish it within its domain`}

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

function enhanceAndPolishSummary(summary, title, originalContent) {
    // Deep clean and normalize the summary
    summary = summary.replace(/^\s*Summary:?\s*/i, '').trim();
    
    // Advanced section formatting with emoji and structure preservation
    summary = summary.replace(/^([A-Z][A-Za-z\s&,]+)[:.]?\s*$/gm, '## $1');
    summary = summary.replace(/^(\*\*[^*]+\*\*)/gm, '## $1');
    summary = summary.replace(/^#{1,2}\s*([^#\n]+)/gm, '## $1');
    
    // Standardize bullet points and enhance formatting
    summary = summary.replace(/^[-*•·]\s*/gm, '• ');
    summary = summary.replace(/^\d+\.\s*/gm, '• ');
    summary = summary.replace(/^•\s*\*\*/gm, '• **');
    
    // Advanced content enhancement
    summary = enhanceContentQuality(summary, title, originalContent);
    
    // Optimize section structure and spacing
    summary = optimizeSectionStructure(summary);
    
    // Add engaging elements and polish
    summary = addEngagingElements(summary, title);
    
    // Final polish and cleanup
    summary = finalPolish(summary);
    
    return summary;
}

function enhanceContentQuality(summary, title, originalContent) {
    const sections = summary.split(/^## /gm).filter(s => s.trim());
    const enhancedSections = [];
    
    for (let section of sections) {
        const lines = section.split('\n').filter(l => l.trim());
        if (lines.length === 0) continue;
        
        const sectionTitle = lines[0].trim();
        const sectionContent = lines.slice(1).join('\n').trim();
        
        // Enhanced content analysis and improvement
        let improvedContent = sectionContent;
        
        // If section is too sparse, enhance it intelligently
        if (sectionContent.length < 80 || isContentTooGeneric(sectionContent)) {
            improvedContent = intelligentContentEnhancement(sectionTitle, sectionContent, originalContent, title);
        }
        
        // Improve bullet points and structure
        improvedContent = enhanceBulletPoints(improvedContent, sectionTitle);
        
        // Add depth and context where appropriate
        improvedContent = addContextualDepth(improvedContent, sectionTitle, title);
        
        enhancedSections.push(`## ${sectionTitle}\n\n${improvedContent}`);
    }
    
    // Ensure we have essential sections
    return ensureEssentialSections(enhancedSections, title, originalContent);
}

function isContentTooGeneric(content) {
    const genericPhrases = [
        'this topic', 'these concepts', 'fundamental concepts',
        'important to understand', 'plays a role', 'can be applied'
    ];
    return genericPhrases.some(phrase => content.toLowerCase().includes(phrase));
}

function intelligentContentEnhancement(sectionTitle, content, originalContent, title) {
    const titleLower = sectionTitle.toLowerCase();
    const sentences = originalContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
    
    // Extract relevant content based on section type
    let relevantContent = extractRelevantContent(titleLower, sentences, title);
    
    // If we have relevant content, use it; otherwise improve existing content
    if (relevantContent.length > 0) {
        return formatExtractedContent(relevantContent, titleLower);
    } else {
        return improveExistingContent(content, titleLower, title);
    }
}

function extractRelevantContent(sectionType, sentences, title) {
    if (sectionType.includes('learning objectives') || sectionType.includes('objective')) {
        return generateLearningObjectives(title);
    } else if (sectionType.includes('key terms') || sectionType.includes('definition')) {
        return sentences.filter(s => 
            /\b(is|are)\s+(a|an|the)\b|\bdefines?\b|\bknown\s+as\b|\brefers?\s+to\b|\bmeans?\b/i.test(s)
        ).slice(0, 4);
    } else if (sectionType.includes('historical') || sectionType.includes('timeline')) {
        return sentences.filter(s => 
            /\b\d{4}\b|\b(century|era|period|ancient|medieval|modern|founded|established|created)\b/i.test(s)
        ).slice(0, 4);
    } else if (sectionType.includes('fact') || sectionType.includes('data')) {
        return sentences.filter(s => 
            /\b\d+[,.]?\d*\s*(percent|%|million|billion|thousand|meters?|feet|miles|kg)\b|\b(largest|biggest|smallest|highest|deepest)\b/i.test(s)
        ).slice(0, 4);
    } else if (sectionType.includes('application') || sectionType.includes('relevance')) {
        return sentences.filter(s => 
            /\b(used|applied|utilize|employ|practice|application|relevant|today|currently|modern)\b/i.test(s)
        ).slice(0, 4);
    }
    return [];
}

function generateLearningObjectives(title) {
    return [
        `**Analyze** the fundamental principles and core concepts of ${title}`,
        `**Evaluate** the historical development and key milestones`,
        `**Apply** knowledge to understand real-world contexts and applications`,
        `**Synthesize** information to make connections with related fields and concepts`,
        `**Assess** the significance and impact within its domain`
    ];
}

function formatExtractedContent(content, sectionType) {
    if (Array.isArray(content)) {
        if (sectionType.includes('learning objectives')) {
            return content.map(obj => `• ${obj}`).join('\n');
        } else {
            return content.map(item => `• ${item.trim()}`).join('\n');
        }
    }
    return content;
}

function improveExistingContent(content, sectionType, title) {
    if (!content || content.length < 20) {
        return generateDefaultContent(sectionType, title);
    }
    
    // Enhance existing content
    let improved = content;
    
    // Add bold formatting to key terms
    improved = improved.replace(/^(• )([^:]+)(: )/gm, '$1**$2**$3');
    
    // Improve sentence structure
    improved = improved.replace(/\b(this topic|these concepts)\b/gi, title);
    
    return improved;
}

function generateDefaultContent(sectionType, title) {
    if (sectionType.includes('learning objectives')) {
        return formatExtractedContent(generateLearningObjectives(title), sectionType);
    } else if (sectionType.includes('significance')) {
        return `• **Academic Impact**: ${title} contributes essential knowledge and understanding to its field\n• **Practical Relevance**: Real-world applications demonstrate its continuing importance\n• **Future Potential**: Ongoing developments reveal new possibilities and applications`;
    } else if (sectionType.includes('study') || sectionType.includes('techniques')) {
        return `• **Active Learning**: Engage with the material through examples and practical applications\n• **Conceptual Mapping**: Create visual connections between different aspects of the topic\n• **Critical Analysis**: Question assumptions and examine evidence systematically\n• **Synthesis Practice**: Combine knowledge from different sources to deepen understanding`;
    }
    return `• This section provides important information about ${title}\n• Key concepts and principles are fundamental to understanding\n• Practical applications demonstrate real-world relevance`;
}

function enhanceBulletPoints(content, sectionTitle) {
    // Improve bullet point structure and formatting
    let enhanced = content;
    
    // Ensure consistent bullet formatting
    enhanced = enhanced.replace(/^[-*]\s*/gm, '• ');
    
    // Add emphasis to key terms at the start of bullet points
    enhanced = enhanced.replace(/^(• )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(:\s*)/gm, '$1**$2**$3');
    
    // Improve generic statements
    enhanced = enhanced.replace(/• This topic/g, `• ${sectionTitle}`);
    
    return enhanced;
}

function addContextualDepth(content, sectionTitle, title) {
    // Add more sophisticated language and depth
    let enhanced = content;
    
    // Replace simple verbs with more academic language where appropriate
    const replacements = {
        'helps': 'facilitates',
        'shows': 'demonstrates',
        'tells': 'reveals',
        'gives': 'provides',
        'makes': 'enables'
    };
    
    Object.entries(replacements).forEach(([simple, academic]) => {
        enhanced = enhanced.replace(new RegExp(`\\b${simple}\\b`, 'gi'), academic);
    });
    
    return enhanced;
}

function optimizeSectionStructure(summary) {
    // Improve spacing and section breaks
    summary = summary.replace(/\n\n\n+/g, '\n\n');
    summary = summary.replace(/^##\s*(.+)\n([^#•])/gm, '## $1\n\n$2');
    summary = summary.replace(/^##\s*(.+)\n\n•/gm, '## $1\n\n•');
    
    return summary;
}

function addEngagingElements(summary, title) {
    // Add more engaging language and remove redundancy
    let enhanced = summary;
    
    // Improve section transitions and flow
    enhanced = enhanced.replace(/## 🔍 Core Concepts/g, '## 🔍 Core Concepts Deep Dive');
    enhanced = enhanced.replace(/## 📊 Important Facts/g, '## 📊 Essential Facts & Data');
    enhanced = enhanced.replace(/## 💡 Real-World Applications/g, '## 💡 Real-World Impact & Applications');
    
    return enhanced;
}

function ensureEssentialSections(sections, title, originalContent) {
    const sectionTitles = sections.map(s => s.split('\n')[0]);
    
    // Check if we have essential sections, add if missing
    const essentialSections = [
        '🎯 Learning Objectives',
        '📚 Key Terms & Definitions',
        '💡 Real-World Impact & Applications',
        '❓ Review Questions'
    ];
    
    essentialSections.forEach(essential => {
        if (!sectionTitles.some(title => title.includes(essential))) {
            sections.push(generateMissingSection(essential, title, originalContent));
        }
    });
    
    return sections.join('\n\n');
}

function generateMissingSection(sectionType, title, originalContent) {
    if (sectionType.includes('Learning Objectives')) {
        return `## 🎯 Learning Objectives\n\n${formatExtractedContent(generateLearningObjectives(title), 'learning objectives')}`;
    } else if (sectionType.includes('Review Questions')) {
        return `## ❓ Review Questions\n\n• What are the fundamental principles that define ${title}?\n• How has this topic evolved and developed over time?\n• What are the most significant real-world applications?\n• Why is this topic important in its field?`;
    }
    return `## ${sectionType}\n\n• Key information about ${title}\n• Important concepts and principles\n• Relevant applications and significance`;
}

function finalPolish(summary) {
    // Final cleanup and polish
    summary = summary.replace(/\n{3,}/g, '\n\n');
    summary = summary.replace(/•\s*•/g, '•');
    summary = summary.replace(/\*\s*\*\*/g, '');
    summary = summary.replace(/\s+\n/g, '\n');
    
    return summary.trim();
}

// Advanced summarization for multiple articles
async function generateUnifiedSummary(cluster, summaryParams) {
    const articles = cluster.articles;
    const theme = cluster.theme;
    
    // Combine optimized content from the cluster
    const combinedContent = articles.map(article => 
        `Article: ${article.title}\n${article.optimizedContent}`
    ).join('\n\n---\n\n');
    
    const combinedTitle = articles.map(a => a.title).join(', ');
    
    const unifiedPrompt = `Create a comprehensive study guide for these related ${theme} topics: ${combinedTitle}

These articles share the common theme of ${theme}. Create a cohesive study guide that:

1. **Synthesizes Information**: Combine related concepts from all articles into unified explanations
2. **Identifies Connections**: Highlight relationships and interactions between the topics
3. **Provides Context**: Show how these topics fit together in the broader field of ${theme}
4. **Maintains Clarity**: Despite covering multiple topics, keep explanations clear and organized

## 🎯 Unified Learning Objectives
Create learning objectives that span all topics and emphasize their interconnections.

## 📚 Core Concepts Integration
Merge related concepts from all articles, showing how they build upon or relate to each other.

## 🔗 Cross-Topic Connections
Explicitly highlight how the topics influence, relate to, or build upon each other.

## 📊 Comparative Analysis
Where appropriate, compare and contrast similar concepts across the different topics.

## 💡 Synthesized Applications
Show how the combined knowledge from all topics creates broader applications and understanding.

Content to analyze:
${combinedContent}

Aim for ${summaryParams.target_words} words of cohesive, integrated content.`;

    return await queryOpenRouterForSummary(unifiedPrompt, summaryParams);
}

async function generateMultiTopicSummary(clusters, summaryParams) {
    const totalArticles = clusters.reduce((sum, cluster) => sum + cluster.articles.length, 0);
    
    // Create section for each cluster, then a synthesis section
    const clusterSummaries = await Promise.all(
        clusters.map(async (cluster) => {
            if (cluster.articles.length === 1) {
                // Single article in cluster
                const article = cluster.articles[0];
                return {
                    theme: cluster.theme,
                    content: await generateSummary(article.optimizedContent, article.title, {
                        max_tokens: Math.floor(summaryParams.max_tokens / clusters.length),
                        target_words: `${Math.floor(parseInt(summaryParams.target_words.split('-')[0]) / clusters.length)}-${Math.floor(parseInt(summaryParams.target_words.split('-')[1]) / clusters.length)}`
                    }),
                    titles: [article.title]
                };
            } else {
                // Multiple articles in cluster
                return {
                    theme: cluster.theme,
                    content: await generateUnifiedSummary(cluster, {
                        max_tokens: Math.floor(summaryParams.max_tokens / clusters.length),
                        target_words: `${Math.floor(parseInt(summaryParams.target_words.split('-')[0]) / clusters.length)}-${Math.floor(parseInt(summaryParams.target_words.split('-')[1]) / clusters.length)}`
                    }),
                    titles: cluster.articles.map(a => a.title)
                };
            }
        })
    );
    
    // Create final structured summary
    const structuredSummary = createStructuredMultiTopicSummary(clusterSummaries, totalArticles);
    
    return structuredSummary;
}

function createStructuredMultiTopicSummary(clusterSummaries, totalArticles) {
    const themes = clusterSummaries.map(cs => cs.theme);
    const allTitles = clusterSummaries.flatMap(cs => cs.titles);
    
    let summary = `# Comprehensive Study Guide: Multiple Topics\n\n`;
    summary += `This study guide covers ${totalArticles} articles across ${themes.length} different domains: ${themes.join(', ')}.\n\n`;
    
    // Add overview section
    summary += `## 📋 Overview\n\n`;
    summary += `**Topics Covered**: ${allTitles.join(', ')}\n\n`;
    summary += `**Domains**: ${themes.map(theme => `**${theme.charAt(0).toUpperCase() + theme.slice(1)}**`).join(', ')}\n\n`;
    
    // Add each cluster's content
    clusterSummaries.forEach((cluster, index) => {
        const sectionTitle = cluster.titles.length === 1 
            ? cluster.titles[0] 
            : `${cluster.theme.charAt(0).toUpperCase() + cluster.theme.slice(1)} Topics`;
            
        summary += `## ${index + 1}. ${sectionTitle}\n\n`;
        if (cluster.titles.length > 1) {
            summary += `*Covering: ${cluster.titles.join(', ')}*\n\n`;
        }
        summary += cluster.content + '\n\n';
    });
    
    // Add synthesis section if multiple themes
    if (themes.length > 1) {
        summary += `## 🔗 Cross-Domain Insights\n\n`;
        summary += generateCrossDomainInsights(clusterSummaries);
    }
    
    // Add integrated review questions
    summary += `## ❓ Comprehensive Review Questions\n\n`;
    summary += generateIntegratedReviewQuestions(clusterSummaries);
    
    return summary;
}

function generateCrossDomainInsights(clusterSummaries) {
    const themes = clusterSummaries.map(cs => cs.theme);
    let insights = '';
    
    insights += `### Interdisciplinary Connections\n\n`;
    insights += `• **Methodological Similarities**: How do research and analytical approaches compare across ${themes.join(' and ')}?\n\n`;
    insights += `• **Historical Patterns**: What common historical trends or patterns emerge across these different domains?\n\n`;
    insights += `• **Contemporary Relevance**: How do these topics intersect in modern applications and current events?\n\n`;
    
    if (themes.includes('science') && themes.includes('technology')) {
        insights += `• **Science-Technology Interface**: How do scientific principles drive technological innovations in these areas?\n\n`;
    }
    
    if (themes.includes('history') && (themes.includes('culture') || themes.includes('geography'))) {
        insights += `• **Cultural-Historical Context**: How have historical events shaped cultural and geographical developments?\n\n`;
    }
    
    insights += `### Comparative Analysis Framework\n\n`;
    insights += `• Compare the scale and scope of impact across different domains\n`;
    insights += `• Analyze the role of human agency vs. natural forces\n`;
    insights += `• Evaluate the pace of change and development in each area\n\n`;
    
    return insights;
}

function generateIntegratedReviewQuestions(clusterSummaries) {
    const themes = clusterSummaries.map(cs => cs.theme);
    let questions = '';
    
    questions += `### Analysis Questions\n\n`;
    questions += `• How do the methodologies and approaches differ between ${themes.join(', ')} disciplines?\n\n`;
    questions += `• What are the most significant challenges facing each of these domains today?\n\n`;
    questions += `• Which topics show the most potential for future development or research?\n\n`;
    
    questions += `### Synthesis Questions\n\n`;
    questions += `• If you had to explain the connections between all these topics to someone unfamiliar with them, what would you emphasize?\n\n`;
    questions += `• What skills or knowledge from one domain could be applied to enhance understanding in another?\n\n`;
    questions += `• How might these different fields collaborate to address global challenges?\n\n`;
    
    questions += `### Application Questions\n\n`;
    questions += `• Design a project that would require knowledge from at least two of these domains\n\n`;
    questions += `• What career paths might benefit from understanding multiple topics covered here?\n\n`;
    questions += `• How would you prioritize learning these topics based on your personal or professional goals?\n\n`;
    
    return questions;
}

async function queryOpenRouterForSummary(promptText, summaryParams) {
    const models = [
        'mistralai/mistral-small-3.2-24b-instruct:free',
        'microsoft/phi-3.5-mini-instruct:free',
        'meta-llama/llama-3.2-3b-instruct:free',
        'qwen/qwen-2.5-coder-32b-instruct:free'
    ];
    
    for (const model of models) {
        try {
            const response = await queryOpenRouter([{
                role: 'user',
                content: promptText
            }], model);
            
            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error(`Error with model ${model}:`, error.message);
            if (models.indexOf(model) === models.length - 1) {
                throw error;
            }
        }
    }
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

        // Analyze and optimize content for better summarization
        const analyzedArticles = articles.map(article => ({
            ...article,
            analysis: analyzeContentComplexity(article.content),
            optimizedContent: optimizeContentForSummarization(article.content)
        }));

        console.log(`Analyzed ${analyzedArticles.length} articles with content types:`, 
                    analyzedArticles.map(a => `${a.title}: ${a.analysis.contentType}`));

        // Group articles by semantic similarity and content type
        const clusters = extractSemanticClusters(analyzedArticles);
        console.log(`Organized into ${clusters.length} thematic clusters`);

        // For multiple articles, adjust summary parameters based on diversity
        const multiSummaryParams = {
            max_tokens: Math.min(summaryParams.max_tokens * Math.max(1.2, clusters.length * 0.3), 1200),
            target_words: `${Math.max(parseInt(summaryParams.target_words.split('-')[0]) * clusters.length * 0.7, 300)}-${Math.max(parseInt(summaryParams.target_words.split('-')[1]) * clusters.length * 0.8, 500)}`
        };

        let unifiedSummary;
        try {
            if (clusters.length === 1 && clusters[0].articles.length > 1) {
                // Related articles - create a unified thematic summary
                console.log(`Generating unified summary for ${clusters[0].theme} topics`);
                unifiedSummary = await generateUnifiedSummary(clusters[0], multiSummaryParams);
            } else if (clusters.length > 1) {
                // Mixed topics - create a structured multi-topic summary
                console.log(`Generating multi-topic summary for ${clusters.length} different themes`);
                unifiedSummary = await generateMultiTopicSummary(clusters, multiSummaryParams);
            } else {
                // Single article or very similar articles
                const combinedTitle = analyzedArticles.map(a => a.title).join(', ');
                const combinedContent = analyzedArticles.map(article => 
                    `## ${article.title}\n\n${article.optimizedContent}`
                ).join('\n\n---\n\n');
                unifiedSummary = await generateSummary(combinedContent, combinedTitle, multiSummaryParams);
            }
        } catch (error) {
            console.error('Failed to generate optimized summary:', error.message);
            
            // Fallback: Generate individual summaries and combine them
            console.log('Falling back to individual summaries...');
            const individualSummaries = [];
            
            for (const article of analyzedArticles) {
                try {
                    const summary = await generateSummary(article.optimizedContent, article.title, summaryParams);
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
            wordCount: unifiedSummary.split(/\s+/).length,
            analytics: {
                clusters: clusters.map(cluster => ({
                    theme: cluster.theme,
                    articleCount: cluster.articles.length,
                    titles: cluster.articles.map(a => a.title),
                    averageComplexity: cluster.articles.reduce((sum, a) => sum + (a.analysis.complexity === 'high' ? 3 : a.analysis.complexity === 'medium' ? 2 : 1), 0) / cluster.articles.length
                })),
                contentTypes: analyzedArticles.map(a => ({ title: a.title, type: a.analysis.contentType, complexity: a.analysis.complexity })),
                optimization: {
                    totalOriginalLength: articles.reduce((sum, a) => sum + a.content.length, 0),
                    totalOptimizedLength: analyzedArticles.reduce((sum, a) => sum + a.optimizedContent.length, 0),
                    compressionRatio: (analyzedArticles.reduce((sum, a) => sum + a.optimizedContent.length, 0) / articles.reduce((sum, a) => sum + a.content.length, 0)).toFixed(2)
                },
                summaryStrategy: clusters.length === 1 && clusters[0].articles.length > 1 ? 'unified_thematic' :
                                clusters.length > 1 ? 'multi_topic_structured' : 'standard_combined'
            }
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