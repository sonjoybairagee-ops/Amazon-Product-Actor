const MARKETPLACE_DOMAINS = {
    'amazon.com': 'https://www.amazon.com',
    'amazon.co.uk': 'https://www.amazon.co.uk',
    'amazon.de': 'https://www.amazon.de',
    'amazon.in': 'https://www.amazon.in',
    'amazon.ca': 'https://www.amazon.ca',
    'amazon.fr': 'https://www.amazon.fr',
    'amazon.it': 'https://www.amazon.it',
    'amazon.es': 'https://www.amazon.es',
};

export function buildRequests({ productUrls, asins, searchQueries, marketplace }) {
    const requests = [];
    const baseUrl = MARKETPLACE_DOMAINS[marketplace] || 'https://www.amazon.com';

    // Direct product URLs
    for (const url of (productUrls || [])) {
        const cleanUrl = url.trim();
        if (!cleanUrl) continue;
        // Detect marketplace from URL
        const domainMatch = cleanUrl.match(/amazon\.(com|co\.uk|de|in|ca|fr|it|es)/);
        requests.push({
            url: cleanUrl,
            userData: {
                type: 'PRODUCT',
                sourceLabel: `url:${cleanUrl}`,
                marketplace: domainMatch ? `amazon.${domainMatch[1]}` : marketplace,
            },
        });
    }

    // ASINs → product URLs
    for (const asin of (asins || [])) {
        const cleanAsin = asin.trim().toUpperCase();
        if (!cleanAsin) continue;
        requests.push({
            url: `${baseUrl}/dp/${cleanAsin}`,
            userData: {
                type: 'PRODUCT',
                sourceLabel: `asin:${cleanAsin}`,
                marketplace,
            },
        });
    }

    // Search queries
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
        });
    }

    return requests;
}

export function getReviewsUrl(productUrl) {
    // Convert product URL to reviews URL
    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) return null;
    const domainMatch = productUrl.match(/(amazon\.[a-z.]+)\//);
    const domain = domainMatch ? `https://www.${domainMatch[1]}` : 'https://www.amazon.com';
    return `${domain}/product-reviews/${asinMatch[1]}?sortBy=recent&pageNumber=1`;
}

export function getQAUrl(productUrl) {
    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) return null;
    const domainMatch = productUrl.match(/(amazon\.[a-z.]+)\//);
    const domain = domainMatch ? `https://www.${domainMatch[1]}` : 'https://www.amazon.com';
    return `${domain}/ask/questions/asin/${asinMatch[1]}/`;
}
