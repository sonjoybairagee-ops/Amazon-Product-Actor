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
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        },
    },
    browserPoolOptions: {
        useFingerprints: true,
    },
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 180,
    maxRequestRetries: 5,

    async requestHandler({ page, request, session }) {
        const { type, sourceLabel, marketplace: mkt } = request.userData;

        // ── Anti-bot: Hide automation ──
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        // Set realistic headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        });

        // Block heavy resources to speed up
        await page.route('**/*.{mp4,mp3,woff,woff2,ttf,otf}', (route) => route.abort());

        log.info(`[${type}] Processing: ${request.url}`);

        try {
            await page.goto(request.url, {
                waitUntil: 'domcontentloaded',
                timeout: 120000,
            });
        } catch (e) {
            log.warning(`Navigation issue: ${e.message}`);
        }

        // ── Random human-like delay ──
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 3000));

        // ── Scroll down to trigger lazy loading ──
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(1000);

        // Check for CAPTCHA / bot detection
        const title = await page.title();
        log.info(`Page title: ${title}`);

        if (title.includes('Robot Check') || title.includes('CAPTCHA') || title.includes('Sorry!') || title.includes('503')) {
            log.warning(`Bot detected on ${request.url} — retiring session`);
            session?.retire();
            throw new Error('Bot detection triggered — will retry');
        }

        // ── SEARCH page ──
        if (type === 'SEARCH') {
            await page.waitForSelector('[data-component-type="s-search-result"], .s-no-outline', { timeout: 30000 }).catch(() => {});
            const products = await extractSearchResults(page, maxProductsPerSearch);
            log.info(`[SEARCH] Found ${products.length} products for "${request.userData.query}"`);

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
            // Wait longer for product page to fully load
            await page.waitForSelector('#productTitle, #title, #dp', { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(2000);

            // Extra scroll to load all content
            await page.evaluate(() => {
                window.scrollTo(0, 300);
            });
            await page.waitForTimeout(1000);

            const productData = await extractProductData(page, request.url);

            if (!productData.title) {
                // Save screenshot for debugging
                log.warning(`No product title found for ${request.url}`);
                log.warning(`Page title was: ${title}`);

                // Try to get any text from page
                const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
                log.warning(`Page body preview: ${bodyText}`);
                return;
            }

            log.info(`✅ Product: ${productData.title?.slice(0, 60)}... | Price: ${productData.currency} ${productData.price}`);

            // Scrape reviews
            let reviews = [];
            if (scrapeReviews && productData.asin) {
                const reviewsUrl = getReviewsUrl(request.url);
                if (reviewsUrl) {
                    try {
                        await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
                        await page.waitForTimeout(2000);
                        await page.waitForSelector('[data-hook="review"]', { timeout: 15000 }).catch(() => {});
                        reviews = await extractReviews(page, maxReviews);
                        log.info(`  Reviews: ${reviews.length}`);
                        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
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
                        await page.goto(qaUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
                        await page.waitForTimeout(2000);
                        await page.waitForSelector('.askTeaserQuestions, #ask-btf-container', { timeout: 15000 }).catch(() => {});
                        qa = await extractQA(page);
                        log.info(`  Q&A: ${qa.length}`);
                    } catch (e) {
                        log.warning(`Q&A scrape failed: ${e.message}`);
                    }
                }
            }

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
