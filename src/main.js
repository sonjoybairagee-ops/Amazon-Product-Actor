    async requestHandler({ page, request, session, requestQueue }) {
        const { type, sourceLabel, marketplace: mkt, asin: reqAsin } = request.userData;

        // ── Anti-bot: Hide automation ──
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

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
            await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        } catch (e) {
            log.warning(`Navigation issue: ${e.message}`);
            session?.retire();
            throw e; // Let Crawlee retry
        }

        // ── Random human-like delay ──
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 3000));

        // ── Scroll down to trigger lazy loading ──
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(1000);

        // Check for CAPTCHA / bot detection
        const title = await page.title();
        if (title.includes('Robot Check') || title.includes('CAPTCHA') || title.includes('Sorry!') || title.includes('503')) {
            log.warning(`🚫 Bot detected on ${request.url} — retiring session`);
            session?.retire();
            throw new Error('Bot detection triggered — session retired, will retry');
        }

        // ── 1. SEARCH page ──
        if (type === 'SEARCH') {
            await page.waitForSelector('[data-component-type="s-search-result"], .s-no-outline', { timeout: 30000 }).catch(() => {});
            const products = await extractSearchResults(page, maxProductsPerSearch);
            log.info(`[SEARCH] Found ${products.length} products for "${request.userData.query}"`);

            for (const product of products) {
                if (product.url && product.asin) {
                    await requestQueue.addRequest({
                        url: product.url,
                        userData: { type: 'PRODUCT', sourceLabel: `search:${request.userData.query}`, marketplace: mkt, asin: product.asin },
                        uniqueKey: `product_${product.asin}`,
                    });
                }
            }
            return;
        }

        // ── 2. PRODUCT page ──
        if (type === 'PRODUCT') {
            await page.waitForSelector('#productTitle, #title, #dp', { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(1500);

            const productData = await extractProductData(page, request.url);

            // ✅ FIX: Handle silent failure by pushing an error record
            if (!productData.title) {
                log.warning(`❌ No product title found for ${request.url}. Possible CAPTCHA or layout change.`);
                await Actor.pushData({
                    type: 'error',
                    asin: request.userData.asin,
                    url: request.url,
                    error: 'Product title not found. Page might be blocked.',
                    sourceLabel,
                    scrapedAt: new Date().toISOString()
                });
                return;
            }

            log.info(`✅ Product: ${productData.title?.slice(0, 60)}... | Price: ${productData.currency} ${productData.price}`);

            // ✅ FIX: Queue Reviews and QA separately instead of page.goto
            if (scrapeReviews && productData.asin) {
                const reviewsUrl = getReviewsUrl(request.url);
                if (reviewsUrl) {
                    await requestQueue.addRequest({
                        url: reviewsUrl,
                        userData: { type: 'REVIEWS', asin: productData.asin, sourceLabel },
                        uniqueKey: `reviews_${productData.asin}`,
                    });
                }
            }

            if (scrapeQA && productData.asin) {
                const qaUrl = getQAUrl(request.url);
                if (qaUrl) {
                    await requestQueue.addRequest({
                        url: qaUrl,
                        userData: { type: 'QA', asin: productData.asin, sourceLabel },
                        uniqueKey: `qa_${productData.asin}`,
                    });
                }
            }

            // Push main product data (without reviews/QA attached, they will be separate rows linked by ASIN)
            await Actor.pushData({
                ...productData,
                similarProducts: scrapeSimilarProducts ? productData.similarProducts : [],
                sourceLabel,
                type: 'product',
                scrapedAt: new Date().toISOString()
            });

            log.info(`💾 Saved Product: ${productData.asin}`);
        }

        // ── 3. REVIEWS page ──
        if (type === 'REVIEWS') {
            await page.waitForSelector('[data-hook="review"]', { timeout: 15000 }).catch(() => {});
            const reviews = await extractReviews(page, maxReviews);
            await Actor.pushData({
                type: 'reviews',
                asin: reqAsin,
                reviews,
                sourceLabel,
                scrapedAt: new Date().toISOString()
            });
            log.info(`💾 Saved ${reviews.length} reviews for ASIN: ${reqAsin}`);
        }

        // ── 4. QA page (✅ FIX: Added missing QA handler) ──
        if (type === 'QA') {
            await page.waitForSelector('.askTeaserQuestions, #ask-btf-container, .a-expander-content', { timeout: 15000 }).catch(() => {});
            const qa = await extractQA(page);
            await Actor.pushData({
                type: 'qa',
                asin: reqAsin,
                qa,
                sourceLabel,
                scrapedAt: new Date().toISOString()
            });
            log.info(`💾 Saved ${qa.length} Q&A for ASIN: ${reqAsin}`);
        }
    }
