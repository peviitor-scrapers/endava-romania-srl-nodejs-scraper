import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

function anafSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ data: results, success: true })
  };
}

function anafCompanyResponse(data) {
  return {
    ok: true,
    json: async () => ({ data, success: true })
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => 'Error'
  };
}

function cuifirmaSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ results })
  };
}

const ANAF_RECORD = {
  cui: 9533457,
  name: 'ENDAVA ROMANIA SRL',
  address: 'Splaiul Unirii, 4, Bucuresti Sectorul 4, Bucuresti',
  caenCode: '6201',
  inactive: false,
  registrationNumber: 'J2021005735405',
  vatRegistered: true,
  onrcStatusLabel: 'Funcțiune',
  legalForm: 'SRL'
};

const CACHED_DATA = {
  cui: 9533457,
  name: 'ENDAVA ROMANIA SRL',
  address: 'MUNICIPIUL BUCUREŞTI, SECTOR 4, Splaiul Unirii, NR.4',
  registrationNumber: 'J2021005735405',
  caenCode: '6201',
  inactive: false,
  onrcStatusLabel: 'Funcțiune'
};

describe('src/anaf.js', () => {
  let anaf;

  beforeAll(async () => {
    anaf = await import('../../src/anaf.js');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchCompany', () => {
    it('should return array of companies for valid brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 9533457, name: 'ENDAVA ROMANIA SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('Endava');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('cui');
      expect(results[0]).toHaveProperty('name');
    });

    it('should return empty array for non-existent brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([]));

      const results = await anaf.searchCompany('NonExistentBrandXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should include statusLabel in results', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 9533457, name: 'ENDAVA ROMANIA SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('Endava');

      expect(results[0]).toHaveProperty('statusLabel', 'Funcțiune');
    });

    it('should fallback to cuifirma.ro on HTTP error', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(cuifirmaSearchResponse([
          { cui: 9533457, name: 'ENDAVA ROMANIA SRL', is_active: true, status_label: 'Funcțiune' }
        ]));

      const results = await anaf.searchCompany('Endava');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('ENDAVA ROMANIA SRL');
    });

    it('should encode brand name in URL', async () => {
      let capturedUrl;
      mockFetch.mockImplementation((url) => {
        capturedUrl = url;
        return Promise.resolve(anafSearchResponse([]));
      });

      await anaf.searchCompany('ENDAVA SRL');
      expect(capturedUrl).toContain(encodeURIComponent('ENDAVA SRL'));
    });
  });

  describe('getCompanyFromANAF', () => {
    it('should return company data for valid CIF', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(ANAF_RECORD));

      const data = await anaf.getCompanyFromANAF('9533457');

      expect(data).toBeDefined();
      expect(data.cui).toBe(9533457);
      expect(data.name).toBe('ENDAVA ROMANIA SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
    });

    it('should retry on HTTP error then succeed', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(anafCompanyResponse(ANAF_RECORD));

      const data = await anaf.getCompanyFromANAF('9533457');

      expect(data).toBeDefined();
      expect(data.cui).toBe(9533457);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting retries and cuifirma.ro fallback', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('9533457')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should handle API-level error response', async () => {
      mockFetch
        .mockResolvedValue({
          ok: true,
          json: async () => ({ success: false, error: { message: 'Company not found' } })
        })
        .mockResolvedValue(cuifirmaSearchResponse([]));

      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    });

    it('should return null when data is null', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(null));

      const data = await anaf.getCompanyFromANAF('9533457');
      expect(data).toBeNull();
    });
  });

  describe('getCompanyFromANAFWithFallback', () => {
    it('should return fresh data when API works', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(ANAF_RECORD));

      const data = await anaf.getCompanyFromANAFWithFallback('9533457');

      expect(data.name).toBe('ENDAVA ROMANIA SRL');
    });

    it('should use cached data when all sources fail', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      const data = await anaf.getCompanyFromANAFWithFallback('9533457', CACHED_DATA);

      expect(data).toEqual(CACHED_DATA);
    });

    it('should throw when API fails and no cache available', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAFWithFallback('9533457')).rejects.toThrow();
    });
  });
});
