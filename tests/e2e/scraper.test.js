import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import companyConfig from '../../config/company.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const TEST_CIF = '' + companyConfig.cif + '';
const TEST_BRAND = '' + companyConfig.brand + '';
const SR_API_URL = 'https://api.smartrecruiters.com/v1/companies/Endava/postings?country=ro&limit=5';

describe('E2E: Full Scraping Pipeline', () => {

  describe('SmartRecruiters API — Real Data Fetch', () => {
    let apiData;

    beforeAll(async () => {
      const res = await fetch(SR_API_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'application/json'
        }
      });
      apiData = await res.json();
    }, 15000);

    it('should respond with valid job data from SmartRecruiters API', () => {
      expect(apiData).toHaveProperty('content');
      expect(Array.isArray(apiData.content)).toBe(true);
      expect(apiData.content.length).toBeGreaterThan(0);
      expect(apiData).toHaveProperty('totalFound');
      expect(typeof apiData.totalFound).toBe('number');
    }, 10000);

    it('should have Romania jobs with expected fields', () => {
      const job = apiData.content[0];
      expect(job).toHaveProperty('name');
      expect(typeof job.name).toBe('string');
      expect(job).toHaveProperty('refNumber');
      expect(job).toHaveProperty('location');
      expect(job.location).toHaveProperty('country', 'ro');
    });

    it('should have Romanian country on all jobs', () => {
      const allCountries = apiData.content.map(j => j.location?.country);
      expect(allCountries.length).toBeGreaterThan(0);
      expect(allCountries.every(c => c === 'ro')).toBe(true);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let apiData;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(SR_API_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'application/json'
        }
      });
      apiData = await res.json();
    }, 15000);

    it('should parse real SmartRecruiters API response into standardized format', () => {
      const result = index.parseApiJobs(apiData);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.jobs.length).toBeLessThanOrEqual(5);

      const parsed = result.jobs[0];
      expect(parsed).toHaveProperty('url');
      expect(parsed.url).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/Endava\//);
      expect(parsed).toHaveProperty('title');
      expect(parsed).toHaveProperty('workmode');
      expect(['remote', 'on-site', 'hybrid']).toContain(parsed.workmode);
      expect(parsed).toHaveProperty('location');
      expect(Array.isArray(parsed.location)).toBe(true);
      expect(parsed).toHaveProperty('tags');
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseApiJobs(apiData);
      const model = index.mapToJobModel(parsed.jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
      expect(model.url).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/Endava\//);
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const parsed = index.parseApiJobs(apiData);
      const jobs = parsed.jobs.map(j => index.mapToJobModel(j, TEST_CIF));

      const payload = {
        source: 'smartrecruiters.com',
        company: 'ENDAVA ROMANIA SRL',
        cif: TEST_CIF,
        jobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe('ENDAVA ROMANIA SRL');
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
        expect(job.workmode).toMatch(/^(remote|on-site|hybrid)$/);
      }
    });

    it('should produce valid job URLs that are accessible', async () => {
      const parsed = index.parseApiJobs(apiData);

      for (const job of parsed.jobs.slice(0, 2)) {
        const res = await fetch(job.url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'job_seeker_ro_spider' }
        });
        expect(res.ok).toBe(true);
      }
    }, 30000);
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find Endava in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const endava = results.find(c =>
        c.name.toUpperCase().startsWith('ENDAVA') &&
        c.statusLabel === 'Funcțiune'
      );
      expect(endava).toBeDefined();
      expect(endava.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('ENDAVA ROMANIA SRL');
      expect(result.cif).toBe(TEST_CIF);
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should detect inactive/radiated companies via ANAF', async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const nonActive = results.find(c => c.statusLabel !== 'Funcțiune');

      if (nonActive) {
        try {
          const anafData = await anaf.getCompanyFromANAF(nonActive.cui.toString());
          expect(anafData).toBeDefined();
          if (anafData.inactive !== undefined) {
            expect(anafData.inactive).toBe(true);
          }
        } catch {
          expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/);
        }
      }
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have Endava jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      expect(result.numFound).toBeGreaterThan(0);

      for (const job of result.docs) {
        expect(job.company).toBe('ENDAVA ROMANIA SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have Endava company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const endava = result.docs[0];
      expect(endava.company).toBe('ENDAVA ROMANIA SRL');
      expect(endava.status).toBe('activ');
    }, 15000);
  });
});
