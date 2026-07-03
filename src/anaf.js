import fetch from "node-fetch";

const ANAF_API_URL = "https://demoanaf.ro/api/company/";
const ANAF_SEARCH_URL = "https://demoanaf.ro/api/search";
const CUI_FIRMA_API_URL = "https://cuifirma.ro/api/search";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeCuifirmaResult(entry, cif) {
  const caenCode = entry.primary_caen_display
    ? entry.primary_caen_display.split("—")[0]?.trim()
    : null;
  return {
    cui: parseInt(entry.cui) || parseInt(cif) || 0,
    name: entry.name || entry.display_name || "",
    address: entry.location || entry.locality || "",
    caenCode,
    inactive: !entry.is_active,
    onrcStatusLabel: entry.status_label || null,
    headquartersAddress: {
      locality: entry.locality || ""
    }
  };
}

async function getCompanyFromCuiFirma(cif) {
  const url = `${CUI_FIRMA_API_URL}?q=${encodeURIComponent(String(cif))}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "job_seeker_ro_spider" }
  });
  if (!res.ok) throw new Error(`cuifirma.ro search error: ${res.status}`);
  const json = await res.json();
  const results = json.results || [];
  const match = results.find(r => String(r.cui) === String(cif));
  if (!match) throw new Error(`cuifirma.ro: CIF ${cif} not found`);
  return normalizeCuifirmaResult(match, cif);
}

export async function getCompanyFromANAF(cif) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${ANAF_API_URL}${cif}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "job_seeker_ro_spider" }
      });
      if (!res.ok) {
        lastError = new Error(`ANAF API error: ${res.status}`);
        console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} failed: ${res.status}, retrying...`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        continue;
      }
      const json = await res.json();
      if (json.success === false) {
        lastError = new Error(json.error?.message || "ANAF returned error");
        console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} failed: ${json.error?.message}, retrying...`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        continue;
      }
      return json.data || null;
    } catch (err) {
      lastError = err;
      console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} error: ${err.message}, retrying...`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  console.log("ANAF API failed after retries — trying cuifirma.ro...");
  try {
    return await getCompanyFromCuiFirma(cif);
  } catch (fbErr) {
    console.log(`cuifirma.ro also failed: ${fbErr.message}`);
    throw lastError || new Error("ANAF API failed after retries");
  }
}

export async function getCompanyFromANAFWithFallback(cif, cachedData = null) {
  try {
    return await getCompanyFromANAF(cif);
  } catch (err) {
    console.log(`\n ANAF API unavailable: ${err.message}`);
    if (cachedData) {
      console.log("Using cached company data as final fallback");
      return cachedData;
    }
    throw err;
  }
}

export async function searchCompany(brandName) {
  const url = `${ANAF_SEARCH_URL}?q=${encodeURIComponent(brandName)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "job_seeker_ro_spider" }
    });
    if (!res.ok) throw new Error(`ANAF search error: ${res.status}`);
    const json = await res.json();
    if (json.data && json.data.length > 0) return json.data;
  } catch (err) {
    console.log(`ANAF search failed: ${err.message}`);
  }
  console.log("Trying cuifirma.ro as fallback for search...");
  try {
    const url = `${CUI_FIRMA_API_URL}?q=${encodeURIComponent(brandName)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "job_seeker_ro_spider" }
    });
    if (!res.ok) throw new Error(`cuifirma.ro search error: ${res.status}`);
    const json = await res.json();
    const results = json.results || [];
    return results.map(r => {
      const sl = (r.status_label || "").toLowerCase();
      const statusLabel = sl === "activă" ? "Funcțiune" : (r.status_label || "");
      return {
        cui: parseInt(r.cui) || 0,
        name: r.name || r.display_name || "",
        statusLabel,
        status: r.status || "",
        address: r.location || "",
        caenCode: r.primary_caen_display
          ? r.primary_caen_display.split("—")[0]?.trim()
          : null
      };
    });
  } catch (fbErr) {
    console.log(`cuifirma.ro search fallback also failed: ${fbErr.message}`);
    throw new Error(`ANAF search error: all sources failed for "${brandName}"`);
  }
}

export async function searchCompanyWithFallback(brandName) {
  return await searchCompany(brandName);
}
