/**
 * Amazon product data extractor.
 * Extracts all data directly from the page DOM.
 */

export async function extractProductData(page, url) {
    return await page.evaluate((pageUrl) => {
        const getText = (selector) =>
            document.querySelector(selector)?.textContent?.trim() || null;

        const getAttr = (selector, attr) =>
            document.querySelector(selector)?.getAttribute(attr) || null;

        const getAll = (selector) =>
            Array.from(document.querySelectorAll(selector)).map(el => el.textContent?.trim()).filter(Boolean);

        // ── ASIN ──
        const asin = (pageUrl.match(/\/dp\/([A-Z0-9]{10})/) ||
            pageUrl.match(/\/product\/([A-Z0-9]{10})/) || [])[1]
            || document.querySelector('[data-asin]')?.getAttribute('data-asin')
            || null;

        // ── Title ──
        const title = getText('#productTitle') || getText('#title');

        // ── Price ──
        let price = null;
        let currency = null;
        const priceEl = document.querySelector('.a-price .a-offscreen')
            || document.querySelector('#priceblock_ourprice')
            || document.querySelector('#priceblock_dealprice')
            || document.querySelector('.a-price-whole');
        if (priceEl) {
            const raw = priceEl.textContent?.trim() || '';
            const numMatch = raw.replace(/,/g, '').match(/[\d.]+/);
            price = numMatch ? parseFloat(numMatch[0]) : null;
            if (raw.includes('$')) currency = 'USD';
            else if (raw.includes('£')) currency = 'GBP';
            else if (raw.includes('€')) currency = 'EUR';
            else if (raw.includes('₹')) currency = 'INR';
            else if (raw.includes('C$')) currency = 'CAD';
        }

        // Original price / discount
        const originalPriceEl = document.querySelector('.a-text-price .a-offscreen');
        const originalPrice = originalPriceEl
            ? parseFloat(originalPriceEl.textContent?.replace(/[^0-9.]/g, '') || '0') || null
            : null;
        const discount = originalPrice && price
            ? Math.round(((originalPrice - price) / originalPrice) * 100)
            : null;

        // ── Rating ──
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

        // ── Images ──
        const images = [];
        try {
            const imgData = document.querySelector('#imgBlkFront, #landingImage');
            if (imgData) {
                const dataJson = imgData.getAttribute('data-a-dynamic-image');
                if (dataJson) {
                    const parsed = JSON.parse(dataJson);
                    images.push(...Object.keys(parsed));
                } else {
                    const src = imgData.getAttribute('src');
                    if (src) images.push(src);
                }
            }
            // Additional images from thumbnail strip
            document.querySelectorAll('#altImages img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.includes('play-button') && !images.includes(src)) {
                    // Convert thumbnail URL to full-size
                    const full = src.replace(/\._[A-Z0-9_,]+_\./, '.');
                    images.push(full);
                }
            });
        } catch {}

        // ── Product details / specs ──
        const specs = {};
        // From product details table
        document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').forEach(row => {
            const key = row.querySelector('th')?.textContent?.trim();
            const val = row.querySelector('td')?.textContent?.trim().replace(/\s+/g, ' ');
            if (key && val) specs[key] = val;
        });
        // From detail bullets
        document.querySelectorAll('#detailBullets_feature_div li').forEach(li => {
            const text = li.textContent?.trim();
            if (text?.includes(':')) {
                const [k, ...v] = text.split(':');
                specs[k.trim()] = v.join(':').trim();
            }
        });
        // From feature bullets
        document.querySelectorAll('.a-unordered-list.a-nostyle.a-vertical.a-spacing-none.detail-bullet-list li').forEach(li => {
            const spans = li.querySelectorAll('span');
            if (spans.length >= 2) {
                specs[spans[0].textContent?.replace(/[:\u200f]/g, '').trim()] = spans[1].textContent?.trim();
            }
        });

        // ── Feature bullets ──
        const features = getAll('#feature-bullets li span:not(.aok-hidden)');

        // ── Variants / options ──
        const variants = [];
        document.querySelectorAll('.swatches .swatch-label, #variation_color_name li, #variation_size_name li').forEach(el => {
            const val = el.textContent?.trim() || el.getAttribute('title');
            if (val) variants.push(val);
        });

        // ── Seller info ──
        const sellerName = getText('#sellerProfileTriggerId')
            || getText('#merchant-info a')
            || getText('.tabular-buybox-text[tabindex="0"]')
            || null;
        const soldBy = getText('#merchant-info') || null;
        const fulfilledBy = document.querySelector('#SSOFpopoverLink')?.textContent?.trim() || null;

        // ── Categories / breadcrumb ──
        const categories = getAll('#wayfinding-breadcrumbs_feature_div li span.a-list-item');

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
                    url: link.startsWith('http') ? link : `https://www.amazon.com${link}`,
                });
            }
        });

        // ── Frequently bought together ──
        const frequentlyBoughtTogether = [];
        document.querySelectorAll('#frequently-bought-together-asin_list li').forEach(el => {
            const asinAttr = el.getAttribute('data-p13n-asin-metadata');
            if (asinAttr) {
                try {
                    const meta = JSON.parse(asinAttr);
                    frequentlyBoughtTogether.push(meta.asin || asinAttr);
                } catch {
                    frequentlyBoughtTogether.push(asinAttr);
                }
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
            variants,
            seller: {
                name: sellerName,
                soldBy,
                fulfilledBy,
            },
            categories,
            similarProducts: similarProducts.slice(0, 10),
            frequentlyBoughtTogether,
            url: pageUrl,
            scrapedAt: new Date().toISOString(),
        };
    }, url);
}

export async function extractReviews(page, maxReviews) {
    return await page.evaluate((max) => {
        const reviews = [];
        document.querySelectorAll('[data-hook="review"]').forEach(el => {
            if (reviews.length >= max) return;
            const ratingEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt');
            reviews.push({
                reviewId: el.getAttribute('id') || null,
                title: el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)')?.textContent?.trim() || null,
                rating: ratingEl ? parseFloat(ratingEl.textContent?.split(' ')[0]) : null,
                date: el.querySelector('[data-hook="review-date"]')?.textContent?.trim() || null,
                verifiedPurchase: !!el.querySelector('[data-hook="avp-badge"]'),
                body: el.querySelector('[data-hook="review-body"] span')?.textContent?.trim() || null,
                helpfulVotes: el.querySelector('[data-hook="helpful-vote-statement"]')?.textContent?.trim() || null,
                author: el.querySelector('.a-profile-name')?.textContent?.trim() || null,
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
        document.querySelectorAll('.askTeaserQuestions > div, #ask-btf-container .a-fixed-left-grid').forEach(el => {
            const question = el.querySelector('.a-declarative[data-action="ask-expand"] span, .askQuestionText')?.textContent?.trim();
            const answer = el.querySelector('.askLongText, .a-expander-content span')?.textContent?.trim();
            if (question) {
                qas.push({
                    question,
                    answer: answer || null,
                    votes: el.querySelector('.askVoteAnswerTextWithCount')?.textContent?.trim() || null,
                });
            }
        });
        return qas;
    });
}

export async function extractSearchResults(page, maxProducts) {
    return await page.evaluate((max) => {
        const results = [];
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
            const href = linkEl?.getAttribute('href');

            results.push({
                asin,
                title: titleEl.textContent?.trim(),
                url: href ? (href.startsWith('http') ? href : `https://www.amazon.com${href}`) : null,
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
