# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile ENDAVA Systems din România.

Extrage anunțurile de pe [Endava Careers](https://jobs.smartrecruiters.com/Endava) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul Peviitor.

> **🌱 Template repo.** Acest repo este **implementarea de referință** pentru toate scraper-ele Node.js din ecosistemul peviitor.ro. Alte scraper-e sunt derivate din acesta. Vezi [ai/AI-DERIVATION-GUIDE.md](../ai/AI-DERIVATION-GUIDE.md).

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul ENDAVA (9533457) și verifică:
   - Denumirea oficială: ENDAVA ROMANIA SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — extrage lista completă de job-uri din API-ul public SmartRecruiters al Endava, filtrat pe România
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în Peviitor** — upsert prin API-ul Peviitor (job-uri și date companie)
6. **Generează jobs.md** — fișier markdown cu informații companie + toate job-urile curente

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| SmartRecruiters | `https://api.smartrecruiters.com/v1/companies/Endava/postings?country=ro` | Public |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |

## Robots.txt

Endava [robots.txt](https://jobs.smartrecruiters.com/Endava/robots.txt) dezactivează:
- `/api/*` — API-ul JSON folosit de scraper
- `/*/vacancy/*` — paginile individuale de job

Scraper-ul folosește API-ul cu rate limiting (1s delay între pagini, 100 job-uri/cerere) și un singur User-Agent identificabil. Paginile individuale de job sunt doar verificate (HEAD request), nu parse-uite.

Pentru analiza completă, vezi [ai/ROBOTS.md](../ai/ROBOTS.md).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, Peviitor API conditional)
npm run test:integration

# Doar E2E (API real SmartRecruiters + ANAF + Peviitor)
npm run test:e2e
```

Testele Peviitor API folosesc `itIfApi` — se auto-skip dacă API-ul Peviitor nu e disponibil.
