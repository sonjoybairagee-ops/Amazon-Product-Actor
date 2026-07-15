/**
 * Amazon Product Data Extractor (Optimized & Robust)
 * Extracts all data directly from the page DOM with multiple fallbacks.
 */

// Helper function to safely parse JSON
const safeJsonParse = (str) => {
    try {
        return str ? JSON.parse(str) : null;
    } catch (e) {
        return null;
    }
};

export async function extractProductData(page, url) {
    return await page.evaluate((pageUrl) => {
        const getText = (selector) =>
            document.querySelector(selector)?.textContent?.trim() || null;

        const getAttr = (selector, attr) =>
            document.querySelector(selector)?.getAttribute(attr) || null;

        const getAll = (selector) =>
            Array.from(document.querySelectorAll(selector))
                .map(el => el.textContent?.trim())
                .filter(Boolean);

        // ── ASIN ──
        const asin = (pageUrl.match(/\/dp\/([A-Z0-9]{10})/) ||
            pageUrl.match(/\/product\/([A-Z0-9]{10})/) || [])[1]
            || getAttr('[data-asin]', 'data-asin')
            || null;

        // ── Title ──
        const title = getText('#productTitle') || getText('#title');

        // ── Price & Currency ──
        let price = null;
        let currency = 'USD'; // Default
        
        // Detect currency from URL hostname
        const hostname = new URL(pageUrl).hostname;
        if (hostname.includes('co.uk')) currency = 'GBP';
        else if (hostname.includes('de') || hostname.includes('fr') || hostname.includes('it') || hostname.includes('es')) currency = 'EUR';
        else if (hostname.includes('in')) currency = 'INR';
        else if (hostname.includes('ca')) currency = 'CAD';
        else if (hostname.includes('jp')) currency = 'JPY';

        const priceEl = document.querySelector('.a-price .a-offscreen')
            || document.querySelector('#priceblock_ourprice')
            || document.querySelector('#priceblock_dealprice')
            || document.querySelector('.a-price-whole');
            
        if (priceEl) {
            const raw = priceEl.textContent?.trim() || '';
            const numMatch = raw.replace(/,/g, '').match(/[\d.]+/);
            price = numMatch ? parseFloat(numMatch[0]) : null;
        }

        // Original price / discount
        const originalPriceEl = document.querySelector('.a-text-price .a-offscreen');
        const originalPrice = originalPriceEl
            ? parseFloat(originalPriceEl.textContent?.replace(/[^0-9.]/g, '') || '0') || null
            : null;
        const discount = (originalPrice && price && originalPrice > price)
            ? Math.round(((originalPrice - price) / originalPrice) * 100)
            : null;

        // ── Rating & Reviews ──
        const ratingText = getText('.a-icon-alt') || getText('#acrPopover .a-icon-alt');
        const rating = ratingText ? parseFloat(ratingText.split(' ')[0]) : null;

        const reviewCountText = getText('#acrCustomerReviewText') || getText('[data-hook="total-review-count"]');
        const reviewCount = reviewCountText
            ? parseInt(reviewCountText.replace(/[^0-9]/g, ''), 10) || null
            : null;

        // ── Brand ──
        const brand = getText('#bylineInfo')?.replace(/^(Visit the |Brand: )/i, '').replace(/ Store$/, '').trim()
            || getText('.po-brand .po-break-word')
            || null;

        // ── Availability ──
        const availability = getText('#availability span')
            || getText('#outOfStock')
            || getText('[data-feature-name="availability"] span')
            || 'Unknown';

        // ── Images (Multi-tier fallback) ──
        const images = [];
        try {
            // Tier 1: Dynamic JSON data
            const imgData = document.querySelector('#imgBlkFront, #landingImage');
            if (imgData) {
                const dataJson = imgData.getAttribute('data-a-dynamic-image');
                const parsed = safeJsonParse(dataJson);
                if (parsed) {
                    images.push(...Object.keys(parsed));
                }
            }
            
            // Tier 2: Main image src
            if (images.length === 0 && imgData) {
                const src = imgData.getAttribute('src') || imgData.getAttribute('data-src');
                if (src) images.push(src);
            }

            // Tier 3: Gallery thumbnails converted to full size
            document.querySelectorAll('#altImages img, .a-carousel img').forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-old-hires');
                if (src && !src.includes('placeholder') && !src.includes('play-button')) {
                    const full = src.replace(/\._[A-Z0-9_,]+_\./, '.');
                    if (!images.includes(full)) images.push(full);
                }
            });
        } catch (e) {
            // Silently fail, images will be empty or partially filled
        }

        // ── Product details / specs ──
        const specs = {};
        const specSelectors = [
            '#productDetails_techSpec_section_1 tr',
            '#productDetails_detailBullets_sections1 tr',
            '#productDetails_feature_div tr',
            '.techSpecsTable tr',
            '#specifications_table tr'
        ];
        
        specSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(row => {
                const key = row.querySelector('th, td:first-child')?.textContent?.trim();
                const val = row.querySelector('td:last-child, td:nth-child(2)')?.textContent?.trim().replace(/\s+/g, ' ');
                if (key && val && key !== val) specs[key] = val;
            });
        });

        // From detail bullets
        document.querySelectorAll('#detailBullets_feature_div li').forEach(li => {
            const text = li.textContent?.trim();
            if (text?.includes(':')) {
                const [k, ...v] = text.split(':');
                specs[k.trim()] = v.join(':').trim();
            }
        });

        // ── Feature bullets ──
        const features = getAll('#feature-bullets li span:not(.aok-hidden), #feature-bullets ul li');

        // ── Variants / options ──
        const variants = [];
        document.querySelectorAll('.swatches .swatch-label, #variation_color_name li, #variation_size_name li, .a-button-text').forEach(el => {
            const val = el.textContent?.trim() || el.getAttribute('title');
            if (val && val.length < 50) variants.push(val); // Filter out long garbage text
        });

        // ── Seller info ──
        const sellerName = getText('#sellerProfileTriggerId')
            || getText('#merchant-info a')
            || getText('.tabular-buybox-text[tabindex="0"]')
            || null;
        const soldBy = getText('#merchant-info') || null;
        const fulfilledBy = document.querySelector('#SSOFpopoverLink')?.textContent?.trim() || null;

        // ── Categories / breadcrumb ──
        const categories = getAll('#wayfinding-breadcrumbs_feature_div li span.a-list-item, #nav-subnav a');

        // ── Best Sellers Rank (BSR) & Date First Available ──
        let bestSellersRank = null;
        let dateFirstAvailable = null;
        
        const bsrText = getText('#productDetails_detailBullets_sections1') || getText('#detailBullets_feature_div');
        if (bsrText) {
            const bsrMatch = bsrText.match(/Best Sellers Rank:\s*(.*?)\s*(?:\(|Date)/i);
            if (bsrMatch) bestSellersRank = bsrMatch[1].trim();
            
            const dateMatch = bsrText.match(/Date First Available:\s*(.*?)\s*\)/i);
            if (dateMatch) dateFirstAvailable = dateMatch[1].trim();
        }

        // ── Similar products ──
        const similarProducts = [];
        document.querySelectorAll('#similarities_feature_div li, #sims-consolidated-2 li, .p13n-sc-uncoverable-faceout').forEach(el => {
            const t = el.querySelector('.p13n-sc-truncate, .a-size-base')?.textContent?.trim();
            const link = el.querySelector('a')?.getAttribute('href');
            const pr = el.querySelector('.a-price .a-offscreen')?.textContent?.trim();
            const asinMatch = link?.match(/\/dp\/([A-Z0-9]{10})/);
            
            if (t && link) {
                similarProducts.push({
                    title: t,
                    asin: asinMatch?.[1] || null,
                    price: pr || null,
                    url: link.startsWith('http') ? link : `https://${new URL(pageUrl).hostname}${link}`,
                });
            }
        });

        // ── Frequently bought together ──
        const frequentlyBoughtTogether = [];
        document.querySelectorAll('#frequently-bought-together-asin_list li, .frequently-bought-together-asin_list li').forEach(el => {
            const asinAttr = el.getAttribute('data-p13n-asin-metadata');
            if (asinAttr) {
                const meta = safeJsonParse(asinAttr);
                frequentlyBoughtTogether.push(meta?.asin || asinAttr);
            }
        });

        return {
            asin,
            title,
            brand,
            price,
            originalPrice,
            discount,
            currency,
            rating,
            reviewCount,
            availability,
            images: [...new Set(images)].slice(0, 20),
            features,
            specs,
            variants: [...new Set(variants)].slice(0, 15),
            seller: { name: sellerName, soldBy, fulfilledBy },
            categories: [...new Set(categories)].slice(0, 5),
            bestSellersRank,
            dateFirstAvailable,
            similarProducts: similarProducts.slice(0, 10),
            frequentlyBoughtTogether: [...new Set(frequentlyBoughtTogether)].slice(0, 5),
            url: pageUrl,
            scrapedAt: new Date().toISOString(),
        };
    }, url);
}

export async function extractReviews(page, maxReviews) {
    return await page.evaluate((max) => {
        const reviewElements = document.querySelectorAll('[data-hook="review"]');
        
        // Handle "No reviews" case gracefully
        if (reviewElements.length === 0) {
            const noReviews = document.querySelector('[data-hook="average-star-rating"]')?.textContent?.includes('0 out of 5');
            if (noReviews) return [];
        }

        const reviews = [];
        reviewElements.forEach(el => {
            if (reviews.length >= max) return;
            
            const ratingEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt');
            const titleEl = el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)');
            const bodyEl = el.querySelector('[data-hook="review-body"] span');
            const dateEl = el.querySelector('[data-hook="review-date"]');
            const authorEl = el.querySelector('.a-profile-name');
            const helpfulEl = el.querySelector('[data-hook="helpful-vote-statement"]');

            reviews.push({
                reviewId: el.getAttribute('id') || null,
                title: titleEl?.textContent?.trim() || null,
                rating: ratingEl ? parseFloat(ratingEl.textContent?.split(' ')[0]) : null,
                date: dateEl?.textContent?.trim() || null,
                verifiedPurchase: !!el.querySelector('[data-hook="avp-badge"]'),
                body: bodyEl?.textContent?.trim() || null,
                helpfulVotes: helpfulEl?.textContent?.trim() || null,
                author: authorEl?.textContent?.trim() || null,
                images: Array.from(el.querySelectorAll('[data-hook="review-image-tile"]'))
                    .map(img => img.getAttribute('src')).filter(Boolean),
            });
        });
        return reviews;
    }, maxReviews);
}

export async function extractQA(page) {
    return await page.evaluate(() => {
        const qas = [];
        
        // Expanded selectors for modern Amazon QA layouts
        const qaSelectors = [
            '.askTeaserQuestions > div',
            '#ask-btf-container .a-fixed-left-grid',
            '.a-section.ask-answer-card',
            '#askSimilarQuestionsAsinFeatureDiv .a-row'
        ];

        qaSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const question = el.querySelector(`
                    .a-declarative[data-action="ask-expand"] span,
                    .askQuestionText,
                    .a-truncate-cut,
                    [data-hook="ask-question"]
                `)?.textContent?.trim();

                const answer = el.querySelector(`
                    .askLongText,
                    .a-expander-content span,
                    [data-hook="ask-answer"]
                `)?.textContent?.trim();

                if (question) {
                    qas.push({
                        question,
                        answer: answer || null,
                        votes: el.querySelector('.askVoteAnswerTextWithCount, .a-size-base')?.textContent?.trim() || null,
                        answeredBy: el.querySelector('.a-profile-name, .ask-answer-author')?.textContent?.trim() || null,
                    });
                }
            });
        });
        return qas;
    });
}

export async function extractSearchResults(page, maxProducts) {
    return await page.evaluate((max) => {
        const results = [];
        const hostname = window.location.hostname;

        document.querySelectorAll('[data-component-type="s-search-result"]').forEach(el => {
            if (results.length >= max) return;
            
            const asin = el.getAttribute('data-asin');
            const titleEl = el.querySelector('h2 a span, h2 span');
            const linkEl = el.querySelector('h2 a');
            const priceEl = el.querySelector('.a-price .a-offscreen');
            const ratingEl = el.querySelector('.a-icon-alt');
            const reviewsEl = el.querySelector('[aria-label*="stars"] + span, .a-size-base.s-underline-text');
            const imgEl = el.querySelector('img.s-image');

            if (!asin || !titleEl) return;
            
            let href = linkEl?.getAttribute('href');
            if (href && !href.startsWith('http')) {
                href = `https://${hostname}${href}`;
            }

            results.push({
                asin,
                title: titleEl.textContent?.trim() || null,
                url: href || null,
                price: priceEl ? parseFloat(priceEl.textContent?.replace(/[^0-9.]/g, '') || '0') || null : null,
                rating: ratingEl ? parseFloat(ratingEl.textContent?.split(' ')[0]) : null,
                reviewCount: reviewsEl ? parseInt(reviewsEl.textContent?.replace(/[^0-9]/g, ''), 10) || null : null,
                imageUrl: imgEl?.getAttribute('src') || null,
                sponsored: !!el.querySelector('.s-sponsored-label-info-icon, [aria-label="Sponsored"]'),
            });
        });
        return results;
    }, maxProducts);
}
