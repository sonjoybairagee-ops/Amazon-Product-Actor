/**
 * Amazon Request Builder
 * Constructs robust URLs for Products, Reviews, QA, and Search across multiple marketplaces.
 */

const MARKETPLACE_DOMAINS = {
    'amazon.com': 'https://www.amazon.com',
    'amazon.co.uk': 'https://www.amazon.co.uk',
    'amazon.de': 'https://www.amazon.de',
    'amazon.in': 'https://www.amazon.in',
    'amazon.ca': 'https://www.amazon.ca',
    'amazon.fr': 'https://www.amazon.fr',
    'amazon.it': 'https://www.amazon.it',
    'amazon.es': 'https://www.amazon.es',
    'amazon.com.au': 'https://www.amazon.com.au',
    'amazon.co.jp': 'https://www.amazon.co.jp',
    'amazon.com.mx': 'https://www.amazon.com.mx',
};

// Helper to safely extract origin (e.g., "https://www.amazon.co.uk") from any URL
function getOriginFromUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.origin;
    } catch (e) {
        return 'https://www.amazon.com'; // Fallback
    }
}

// Helper to extract ASIN from any Amazon URL
function extractAsin(url) {
    const match = url.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : null;
}

export function buildRequests({ productUrls, asins, searchQueries, marketplace }) {
    const requests = [];
    const baseUrl = MARKETPLACE_DOMAINS[marketplace] || 'https://www.amazon.com';

    // 1. Direct product URLs
    for (const url of (productUrls || [])) {
        const cleanUrl = url.trim();
        if (!cleanUrl) continue;
        
        // Dynamically detect marketplace from the URL itself (overrides default marketplace)
        const detectedOrigin = getOriginFromUrl(cleanUrl);
        const detectedMarketplace = Object.keys(MARKETPLACE_DOMAINS).find(key => 
            MARKETPLACE_DOMAINS[key] === detectedOrigin
        ) || marketplace;

        requests.push({
            url: cleanUrl,
            userData: {
                type: 'PRODUCT',
                sourceLabel: `url:${cleanUrl}`,
                marketplace: detectedMarketplace,
                asin: extractAsin(cleanUrl),
            },
            uniqueKey: `product_${extractAsin(cleanUrl) || cleanUrl}`, // Prevents duplicate crawling
        });
    }

    // 2. ASINs → Convert to product URLs
    for (const asin of (asins || [])) {
        const cleanAsin = asin.trim().toUpperCase();
        if (!cleanAsin || cleanAsin.length !== 10) continue; // Basic ASIN validation
        
        requests.push({
            url: `${baseUrl}/dp/${cleanAsin}`,
            userData: {
                type: 'PRODUCT',
                sourceLabel: `asin:${cleanAsin}`,
                marketplace,
                asin: cleanAsin,
            },
            uniqueKey: `product_${cleanAsin}`,
        });
    }

    // 3. Search queries
    for (const query of (searchQueries || [])) {
        const cleanQuery = query.trim();
        if (!cleanQuery) continue;
        
        const encoded = encodeURIComponent(cleanQuery);
        requests.push({
            url: `${baseUrl}/s?k=${encoded}`,
            userData: {
                type: 'SEARCH',
                sourceLabel: `search:${cleanQuery}`,
                marketplace,
                query: cleanQuery,
            },
            uniqueKey: `search_${cleanQuery}_${marketplace}`,
        });
    }

    return requests;
}

export function getReviewsUrl(productUrl) {
    const asin = extractAsin(productUrl);
    if (!asin) return null;
    
    const origin = getOriginFromUrl(productUrl);
    // sortBy=recent ensures we get the latest reviews, pageNumber=1 for the first batch
    return `${origin}/product-reviews/${asin}?sortBy=recent&pageNumber=1`;
}

export function getQAUrl(productUrl) {
    const asin = extractAsin(productUrl);
    if (!asin) return null;
    
    const origin = getOriginFromUrl(productUrl);
    return `${origin}/ask/questions/asin/${asin}/`;
}
