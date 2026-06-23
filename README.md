# 🛒 Amazon Product Scraper

Extract detailed product data from Amazon — including prices, ratings, reviews, Q&A, and more — without any coding required.

## 🚀 What Does This Actor Do?

Amazon Product Scraper lets you collect structured data from Amazon product pages at scale. Simply provide product URLs, ASINs, or search queries, and the actor will return clean, ready-to-use data in JSON or CSV format.

---

## ✅ What Data You Get

| Field | Description |
|-------|-------------|
| `title` | Full product title |
| `price` | Current price |
| `currency` | Currency code (GBP, USD, EUR…) |
| `rating` | Average star rating |
| `reviewCount` | Total number of reviews |
| `asin` | Amazon Standard ID |
| `brand` | Product brand |
| `images` | All product images |
| `description` | Full product description |
| `features` | Bullet point features |
| `reviews` | Top customer reviews |
| `qa` | Customer Q&A |
| `similarProducts` | Related products |
| `availability` | In stock / Out of stock |
| `url` | Source product URL |

---

## 📥 Input Options

You can provide input in **3 ways**:

### 1. Product URLs
Paste direct Amazon product links:
```
https://www.amazon.com/dp/B08N5WRWNW
https://www.amazon.co.uk/dp/1405965436
```

### 2. ASINs
Just the product ID is enough:
```
B08N5WRWNW
1405965436
```

### 3. Search Queries
Search Amazon like a customer:
```
wireless earbuds
gaming laptop under 1000
```

---

## 🌍 Supported Marketplaces

- 🇺🇸 amazon.com
- 🇬🇧 amazon.co.uk
- 🇩🇪 amazon.de
- 🇫🇷 amazon.fr
- 🇮🇳 amazon.in
- 🇨🇦 amazon.ca
- 🇮🇹 amazon.it
- 🇪🇸 amazon.es

---

## ⚙️ Advanced Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxProductsPerSearch` | 20 | Max products per search query |
| `scrapeReviews` | true | Collect customer reviews |
| `maxReviews` | 10 | Number of reviews per product |
| `scrapeQA` | true | Collect Q&A section |
| `scrapeSimilarProducts` | true | Collect related products |

---

## 📤 Output Example

```json
{
  "title": "One Golden Summer",
  "asin": "1405965436",
  "price": 8.99,
  "currency": "GBP",
  "rating": 4.6,
  "reviewCount": 1284,
  "brand": "Penguin Books",
  "availability": "In Stock",
  "images": ["https://..."],
  "features": ["Bestselling novel", "..."],
  "reviews": [
    {
      "author": "John D.",
      "rating": 5,
      "title": "Absolutely loved it",
      "body": "One of the best books I've read this year..."
    }
  ],
  "qa": [
    {
      "question": "Is this a standalone novel?",
      "answer": "Yes, it can be read independently."
    }
  ]
}
```

---

## 💡 Use Cases

- 📊 **Price Monitoring** — Track price changes daily
- 🔍 **Competitor Research** — Analyze competitor products
- 🛍️ **E-commerce** — Build product catalogs
- 📈 **Market Research** — Discover trends and demand
- ⭐ **Review Analysis** — Understand customer sentiment

---

## ⚡ Getting Started

1. Click **Try for free**
2. Add your Amazon product URLs or search queries
3. Click **Start**
4. Download results as **JSON or CSV**

---

## 📊 Performance

- Scrapes **1 product in ~30-60 seconds**
- Handles **bot detection** automatically
- Retries failed requests up to **5 times**
- Supports **proxy rotation** for reliability

---

## 🆓 Free to Use

This actor is **completely free** to use. You only pay for the Apify platform usage (compute units).

Typical cost: **~$0.01–0.05 per product**

---

## 🛠️ Built With

- [Apify SDK](https://docs.apify.com/sdk/js/)
- [Crawlee](https://crawlee.dev/)
- [Playwright](https://playwright.dev/)

---

## 📬 Support

Having issues? Found a bug? Please create an issue or contact us through the Apify platform.

We typically respond within **24 hours**.
