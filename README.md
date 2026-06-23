# Amazon Product Scraper

Scrape Amazon product data without an API key. Supports multiple marketplaces and extracts comprehensive product information.

## Features

- **Product details** — title, price, brand, availability, ASIN
- **Images** — all product images in full resolution
- **Specs & features** — technical specifications, feature bullets
- **Reviews** — customer reviews with ratings, dates, verified purchase status
- **Q&A** — customer questions and answers
- **Similar products** — related product recommendations
- **Frequently bought together** — bundled product suggestions
- **Seller info** — sold by, fulfilled by
- **Multi-marketplace** — amazon.com, amazon.co.uk, amazon.de, amazon.in, amazon.ca, amazon.fr, amazon.it, amazon.es

## Input

| Field | Type | Description |
|-------|------|-------------|
| `productUrls` | array | Direct Amazon product URLs |
| `asins` | array | Amazon Standard Identification Numbers |
| `searchQueries` | array | Search keywords |
| `marketplace` | string | Target marketplace (default: amazon.com) |
| `maxProductsPerSearch` | number | Max products per search query (default: 20) |
| `scrapeReviews` | boolean | Extract reviews (default: true) |
| `maxReviews` | number | Max reviews per product (default: 10) |
| `scrapeQA` | boolean | Extract Q&A (default: true) |
| `scrapeSimilarProducts` | boolean | Extract similar products (default: true) |

## Output

```json
{
  "asin": "B08N5WRWNW",
  "title": "Echo Dot (4th Gen)",
  "brand": "Amazon",
  "price": 49.99,
  "originalPrice": 59.99,
  "discount": 17,
  "currency": "USD",
  "rating": 4.7,
  "reviewCount": 185432,
  "availability": "In Stock",
  "images": ["https://..."],
  "features": ["Built-in Alexa", "..."],
  "specs": { "Connectivity": "Bluetooth, Wi-Fi", "..." },
  "variants": ["Charcoal", "Glacier White"],
  "seller": { "name": "Amazon.com", "soldBy": "Amazon", "fulfilledBy": "Amazon" },
  "categories": ["Electronics", "Smart Home"],
  "reviews": [{ "title": "...", "rating": 5, "body": "..." }],
  "qa": [{ "question": "...", "answer": "..." }],
  "similarProducts": [{ "title": "...", "asin": "...", "price": "..." }],
  "url": "https://www.amazon.com/dp/B08N5WRWNW",
  "scrapedAt": "2026-06-22T..."
}
```

## Notes

- Proxy is strongly recommended for large-scale scraping
- Amazon may block repeated requests without proxy
- Respect Amazon's Terms of Service
