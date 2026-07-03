import { jest } from '@jest/globals';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['România'] },
          { url: 'https://test.com/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://test.com/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://test.com/4', title: 'Job 4', location: ['Cluj-Napoca'] },
          { url: 'https://test.com/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'smartrecruiters.com',
        company: 'endava romania srl',
        cif: '9533457',
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', company: 'endava romania', cif: '9533457' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('ENDAVA ROMANIA SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://test.com/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://test.com/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://test.com/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://jobs.smartrecruiters.com/Endava/REF123',
        title: 'Senior Developer',
        location: ['Bucharest'],
        tags: ['engineering'],
        workmode: 'hybrid'
      };

      const COMPANY_NAME = 'ENDAVA ROMANIA SRL';
      const COMPANY_CIF = '9533457';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.tags).toEqual(rawJob.tags);
      expect(result.workmode).toBe(rawJob.workmode);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://test.com/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '9533457');

      expect(result.location).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://test.com/1' };

      const result = index.mapToJobModel(rawJob, '9533457');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://test.com/1');
    });
  });

  describe('parseApiJob', () => {
    it('should parse a single SmartRecruiters job object', () => {
      const job = {
        name: 'Senior Java Developer',
        refNumber: 'REF1447T',
        ref: 'https://api.smartrecruiters.com/v1/companies/Endava/postings/744000130149805',
        location: {
          city: 'Cluj-Napoca',
          country: 'ro',
          remote: false,
          hybrid: true,
          fullLocation: 'Cluj-Napoca, CJ, Romania'
        },
        department: { label: 'Client Delivery' },
        function: { label: 'Engineering' }
      };

      const result = index.parseApiJob(job);

      expect(result.title).toBe('Senior Java Developer');
      expect(result.location).toEqual(['Cluj-Napoca']);
      expect(result.workmode).toBe('hybrid');
      expect(result.url).toBe('https://jobs.smartrecruiters.com/Endava/744000130149805');
      expect(result.tags).toContain('client delivery');
      expect(result.tags).toContain('engineering');
    });
  });

  describe('parseApiJobs', () => {
    it('should parse SmartRecruiters API response format', () => {
      const apiData = {
        content: [
          {
            name: 'Senior Java Developer',
            refNumber: 'REF1447T',
            ref: 'https://api.smartrecruiters.com/v1/companies/Endava/postings/744000130149805',
            location: {
              city: 'Cluj-Napoca',
              country: 'ro',
              remote: false,
              hybrid: true,
              fullLocation: 'Cluj-Napoca, CJ, Romania'
            },
            department: { label: 'Client Delivery' },
            function: { label: 'Engineering' }
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('Senior Java Developer');
      expect(result.jobs[0].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[0].workmode).toBe('hybrid');
      expect(result.jobs[0].url).toBe('https://jobs.smartrecruiters.com/Endava/744000130149805');
      expect(result.jobs[0].tags).toContain('client delivery');
      expect(result.jobs[0].tags).toContain('engineering');
    });

    it('should map workmode correctly for remote jobs', () => {
      const apiData = {
        content: [
          {
            name: 'Remote Dev',
            refNumber: 'REF999',
            location: { city: 'Bucharest', remote: true, hybrid: false },
            department: { label: 'Engineering' }
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].workmode).toBe('remote');
    });

    it('should map workmode to on-site when neither remote nor hybrid', () => {
      const apiData = {
        content: [
          {
            name: 'On-site Dev',
            refNumber: 'REF888',
            location: { city: 'Bucharest', remote: false, hybrid: false },
            department: { label: 'Engineering' }
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].workmode).toBe('on-site');
    });

    it('should handle empty job list', () => {
      const apiData = { content: [] };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle missing content field', () => {
      const result = index.parseApiJobs({});

      expect(result.jobs).toEqual([]);
    });
  });
});
