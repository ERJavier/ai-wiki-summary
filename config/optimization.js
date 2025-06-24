// Optimization configuration for multi-article summarization

module.exports = {
    // Content analysis thresholds
    similarity: {
        relatedThreshold: 0.3,      // Minimum similarity to group articles together
        highSimilarity: 0.6,        // Articles with high similarity get unified treatment
        diversityBonus: 0.2         // Bonus for diverse topic coverage
    },
    
    // Content optimization limits
    content: {
        maxInputLength: 8000,       // Maximum characters per article before optimization
        optimalParagraphLength: 300, // Target paragraph length for importance scoring
        minParagraphLength: 50,     // Minimum useful paragraph length
        technicalTermWeight: 2.0,   // Weight for technical terms in importance scoring
        numericalDataWeight: 1.5    // Weight for numerical data in importance scoring
    },
    
    // Summary generation parameters
    summary: {
        baseTokenMultiplier: 1.2,   // Base multiplier for multi-article summaries
        clusterTokenBonus: 0.3,     // Additional tokens per semantic cluster
        maxTokensLimit: 1200,       // Hard limit on tokens
        minWordsPerArticle: 100,    // Minimum words to dedicate per article
        diversityPenalty: 0.8       // Reduce verbosity for very diverse topics
    },
    
    // Content type specific adjustments
    contentTypeWeights: {
        biography: {
            chronologyWeight: 2.0,
            achievementWeight: 1.8,
            personalWeight: 0.8
        },
        science: {
            methodologyWeight: 1.9,
            dataWeight: 2.0,
            theoryWeight: 1.7
        },
        history: {
            chronologyWeight: 2.2,
            causationWeight: 2.0,
            contextWeight: 1.6
        },
        geography: {
            locationWeight: 1.8,
            statisticsWeight: 1.9,
            climateWeight: 1.4
        },
        technology: {
            innovationWeight: 2.0,
            applicationWeight: 1.8,
            impactWeight: 1.6
        },
        culture: {
            traditionWeight: 1.7,
            significanceWeight: 1.9,
            modernRelevance: 1.5
        }
    },
    
    // Model selection preferences
    models: {
        primaryModel: 'mistralai/mistral-small-3.2-24b-instruct:free',
        fallbackModels: [
            'microsoft/phi-3.5-mini-instruct:free',
            'meta-llama/llama-3.2-3b-instruct:free',
            'qwen/qwen-2.5-coder-32b-instruct:free'
        ],
        retryAttempts: 3,
        timeoutMs: 30000
    },
    
    // Advanced features
    advanced: {
        enableSemanticClustering: true,
        enableContentOptimization: true,
        enableCrossDomainAnalysis: true,
        enableAdaptiveTokens: true,
        enableFallbackStrategies: true,
        maxClusters: 5,             // Maximum number of semantic clusters
        minClusterSize: 1           // Minimum articles per cluster
    }
}; 