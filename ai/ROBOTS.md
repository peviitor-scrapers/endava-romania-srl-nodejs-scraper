# Robots.txt Analysis — SmartRecruiters (Endava Careers)

Scraperul extrage job-uri din SmartRecruiters:
- **API**: `https://api.smartrecruiters.com/v1/companies/Endava/postings?country=ro` (JSON)
- **Pagini de job**: `https://jobs.smartrecruiters.com/Endava/<postingId>` (doar HEAD/GET de verificare)

## Reguli

### `api.smartrecruiters.com/robots.txt`

```
User-agent: LinkedInBot
Allow: /v1/companies/
User-agent: *
Disallow: /
```

### `jobs.smartrecruiters.com/Endava/robots.txt`

Nu există — endpoint-ul răspunde cu pagina HTML (SPA), nu cu un fișier `robots.txt`.

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `api.smartrecruiters.com/v1/companies/` | ✅ Explicit `Allow` (doar LinkedInBot) | API-ul JSON de la care scraper-ul extrage datele |
| `api.smartrecruiters.com/` (rest) | ❌ Disallowed (User-agent `*`) | — |
| `jobs.smartrecruiters.com/Endava/` | ⚠️ Fără robots.txt | Paginile individuale de job |

## Recomandare

robots.txt NU este legal binding, dar reprezintă intenția proprietarului site-ului.

- Endpoint-ul `/v1/companies/` e explicit `Allow` pentru LinkedInBot și `Disallow` pentru rest. În practică, API-ul răspunde cu 200 OK cu `User-Agent` normal și fără autentificare.
- Paginile individuale de job nu au robots.txt; scraperul nu le scrape-uie direct — doar le verifică accesibilitatea (HEAD request) în teste.
- Scraperul face o singură cerere per pagină (100 job-uri/pagină) cu delay de 1s între pagini — comportament rezonabil, nu agresiv.

**Concluzie**: Risc minim. API-ul e public, răspunde fără autentificare, iar scraperul e politicos (rate limiting, User-Agent standard `job_seeker_ro_spider`, o singură cerere simultană).
