import { Actor, log } from 'apify';
import { PlaywrightCrawler, RequestQueue } from 'crawlee';
import { buildRequests, getReviewsUrl, getQAUrl } from './requestBuilder.js';
import { extractProductData, extractReviews, extractQA, extractSearchResults } from './extractor.js';

await Actor.init();

const input = await Actor.getInput();
const {
    productUrls = [],
    asins = [],
    searchQueries = [],
    marketplace = 'amazon.com',
    maxProductsPerSearch = 20,
    scrapeReviews = true,
    maxReviews = 10,
    scrapeQA = true,
    scrapeSimilarProducts = true,
    proxyConfiguration: proxyConfig,
} = input || {};

if (!productUrls.length && !asins.length && !searchQueries.length) {
    throw new Error('No input provided! Please add productUrls, asins, or searchQueries.');
}

log.info('Starting Amazon Product Scraper...', {
    productUrls: productUrls.length,
    asins: asins.length,
    searchQueries: searchQueries.length,
    marketplace,
});

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const requestQueue = await RequestQueue.open();

const initialRequests = buildRequests({ productUrls, asins, searchQueries, marketplace });
for (const req of initialRequests) {
    await requestQueue.addRequest(req);
}

const crawler = new PlaywrightCrawler({
    requestQueue,
    proxyConfiguration,
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
        },
    },
    browserPoolOptions: {
        useFingerprints: true,
    },
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 180,
    maxRequestRetries: 5,

    async requestHandler({ page, request, session }) {
        const { type, sourceLabel, marketplace: mkt } = request.userData;

        // Set realistic headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        });

        // Block heavy resources
        await page.route('**/*.{mp4,mp3,woff,woff2,ttf,otf}', (route) => route.abort());

        log.info(`[${type}] Processing: ${request.url}`);

        try {
            await page.goto(request.url, {
                waitUntil: 'domcontentloaded',
                timeout: 120000, // ✅ 60000 থেকে 120000 করা হয়েছে
            });
        } catch (e) {
            log.warning(`Navigation issue: ${e.message}`);
        }

        // Check for CAPTCHA / bot detection
        const title = await page.title();
        if (title.includes('Robot Check') || title.includes('CAPTCHA') || title.includes('Sorry!')) {
            log.warning(`Bot detected on ${request.url} — retiring session`);
            session?.retire();
            throw new Error('Bot detection triggered — will retry');
        }

        // ── SEARCH page ──
        if (type === 'SEARCH') {
            await page.waitForSelector('[data-component-type="s-search-result"], .s-no-outline', { timeout: 15000 }).catch(() => {});
            const products = await extractSearchResults(page, maxProductsPerSearch);
            log.info(`[SEARCH] Found ${products.length} products for "${request.userData.query}"`);

            // Enqueue each product for full scraping
            for (const product of products) {
                if (product.url) {
                    await requestQueue.addRequest({
                        url: product.url,
                        userData: {
                            type: 'PRODUCT',
                            sourceLabel: `search:${request.userData.query}`,
                            marketplace: mkt,
                            searchPreview: product,
                        },
                        uniqueKey: `product_${product.asin}`,
                    });
                }
            }
            return;
        }

        // ── PRODUCT page ──
        if (type === 'PRODUCT') {
            await page.waitForSelector('#productTitle, #title', { timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(1500);

            const productData = await extractProductData(page, request.url);

            if (!productData.title) {
                log.warning(`No product data found for ${request.url}`);
                return;
            }

            log.info(`✅ Product: ${productData.title?.slice(0, 60)}... | Price: ${productData.currency} ${productData.price}`);

            // Scrape reviews
            let reviews = [];
            if (scrapeReviews && productData.asin) {
                const reviewsUrl = getReviewsUrl(request.url);
                if (reviewsUrl) {
                    try {
                        await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }); // ✅ 45000 থেকে 90000
                        await page.waitForSelector('[data-hook="review"]', { timeout: 10000 }).catch(() => {});
                        reviews = await extractReviews(page, maxReviews);
                        log.info(`  Reviews: ${reviews.length}`);
                        // Go back to product page for Q&A
                        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 90000 }); // ✅ 45000 থেকে 90000
                    } catch (e) {
                        log.warning(`Reviews scrape failed: ${e.message}`);
                    }
                }
            }

            // Scrape Q&A
            let qa = [];
            if (scrapeQA && productData.asin) {
                const qaUrl = getQAUrl(request.url);
                if (qaUrl) {
                    try {
                        await page.goto(qaUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }); // ✅ 45000 থেকে 90000
                        await page.waitForSelector('.askTeaserQuestions, #ask-btf-container', { timeout: 10000 }).catch(() => {});
                        qa = await extractQA(page);
                        log.info(`  Q&A: ${qa.length}`);
                    } catch (e) {
                        log.warning(`Q&A scrape failed: ${e.message}`);
                    }
                }
            }

            // Save to dataset
            await Actor.pushData({
                ...productData,
                reviews,
                qa,
                similarProducts: scrapeSimilarProducts ? productData.similarProducts : [],
                sourceLabel,
                type: 'product',
            });

            log.info(`💾 Saved: ${productData.asin} — ${productData.title?.slice(0, 50)}`);
        }

        // ── REVIEWS page (direct) ──
        if (type === 'REVIEWS') {
            await page.waitForSelector('[data-hook="review"]', { timeout: 15000 }).catch(() => {});
            const reviews = await extractReviews(page, maxReviews);
            await Actor.pushData({
                type: 'reviews',
                asin: request.userData.asin,
                reviews,
                sourceLabel,
            });
        }
    },

    failedRequestHandler({ request, error }) {
        log.error(`Failed: ${request.url}`, { error: error.message });
    },
});

await crawler.run();

const dataset = await Actor.openDataset();
const { itemCount } = await dataset.getInfo();
log.info(`✅ Finished! Total items saved: ${itemCount}`);

await Actor.exit();
