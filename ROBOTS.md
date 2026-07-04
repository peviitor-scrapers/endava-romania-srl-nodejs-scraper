# Robots.txt Analysis

Endava's career site is hosted via SmartRecruiters API, which does not have a
`robots.txt` restriction that blocks API access. The scraper respects:

- Rate limiting (1s delay between pages)
- Single identifiable User-Agent: `job_seeker_ro_spider`
- Only public job listings are fetched
