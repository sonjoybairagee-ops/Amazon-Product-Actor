*(Note: Reviews and Q&A are saved as separate dataset rows linked by the `asin` field for better data management.)*

---

## ⚠️ Important Notes

1. **Proxy is Mandatory for Scale**: Amazon aggressively blocks datacenter IPs. For reliable scraping, always use **Apify Residential Proxies**.
2. **Rate Limiting**: Keep concurrency low (default is 1). High concurrency will trigger CAPTCHAs.
3. **Terms of Service**: Scraping Amazon may violate their Terms of Service. Use this tool responsibly, at your own risk, and for lawful purposes only.

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| **CAPTCHA / Robot Check** | You are being blocked. Enable **Residential Proxies** and reduce concurrency to `1`. |
| **Empty Results / Missing Data** | Amazon's DOM changes frequently. Check the logs. If persistent, open a GitHub issue. |
| **Slow Execution** | Scraping reviews and Q&A requires additional page loads. Disable them in Input if you only need basic product data. |

---

## 📞 Support

If you encounter any issues, have feature requests, or need a custom scraping solution, please:
- contact the developer at: **sonjoy.bairagee@gmail.com**

*I regularly update this Actor to keep up with Amazon's layout changes.*
