import { pcaTextArr } from "element-china-area-data";
import { pinyin } from "pinyin-pro";

type PcaNode = {
  label: string;
  value: string;
  children?: PcaNode[];
};

const tree = pcaTextArr as PcaNode[];

const PROVINCES = tree.map((p) => p.label);

const cityMap = new Map<string, string[]>();
const districtMap = new Map<string, string[]>();

for (const p of tree) {
  const cities = p.children?.map((c) => c.label) ?? [];
  cityMap.set(p.label, cities);
  for (const c of p.children ?? []) {
    const key = `${p.label}\u0000${c.label}`;
    districtMap.set(key, c.children?.map((d) => d.label) ?? []);
  }
}

const labelSearchBlob = new Map<string, string>();

function blobFor(label: string): string {
  if (labelSearchBlob.has(label)) return labelSearchBlob.get(label)!;
  const full = pinyin(label, { toneType: "none", type: "array" })
    .join("")
    .toLowerCase();
  const first = pinyin(label, { pattern: "first", toneType: "none", type: "array" })
    .join("")
    .toLowerCase();
  const s = `${label} ${full} ${first}`.toLowerCase();
  labelSearchBlob.set(label, s);
  return s;
}

function matchesQuery(raw: string, label: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (label.includes(raw.trim())) return true;
  return blobFor(label).includes(q.replace(/\s+/g, ""));
}

export function getProvinces(): string[] {
  return PROVINCES;
}

export function getCities(province: string): string[] {
  return cityMap.get(province) ?? [];
}

export function getDistricts(province: string, city: string): string[] {
  return districtMap.get(`${province}\u0000${city}`) ?? [];
}

export function filterProvinces(query: string): string[] {
  const q = query.trim();
  if (!q) return PROVINCES;
  return PROVINCES.filter((p) => matchesQuery(q, p));
}

export function filterCities(province: string, query: string): string[] {
  const all = getCities(province);
  const q = query.trim();
  if (!q) return all;
  return all.filter((c) => matchesQuery(q, c));
}

export function filterDistricts(province: string, city: string, query: string): string[] {
  const all = getDistricts(province, city);
  if (!all.length) return [];
  const q = query.trim();
  if (!q) return all;
  return all.filter((d) => matchesQuery(q, d));
}

export function resolveProvince(input: string): string {
  const q = input.trim();
  if (!q) return "";
  if (PROVINCES.includes(q)) return q;
  const f = filterProvinces(q);
  if (f.length === 1) return f[0];
  const exact = f.find((x) => x === q);
  if (exact) return exact;
  const pref = f.filter((x) => x.startsWith(q));
  if (pref.length === 1) return pref[0];
  return "";
}

export function resolveCity(province: string, input: string): string {
  if (!province) return "";
  const q = input.trim();
  if (!q) return "";
  const cities = getCities(province);
  if (cities.includes(q)) return q;
  const f = filterCities(province, q);
  if (f.length === 1) return f[0];
  const pref = f.filter((x) => x.startsWith(q));
  if (pref.length === 1) return pref[0];
  return "";
}

export function resolveDistrict(province: string, city: string, input: string): string {
  if (!province || !city) return "";
  const q = input.trim();
  if (!q) return "";
  const districts = getDistricts(province, city);
  if (districts.includes(q)) return q;
  const f = filterDistricts(province, city, q);
  if (f.length === 1) return f[0];
  const pref = f.filter((x) => x.startsWith(q));
  if (pref.length === 1) return pref[0];
  return "";
}

export function isValidTriple(province: string, city: string, district: string): boolean {
  if (!province || !city || !district) return false;
  const cities = getCities(province);
  if (!cities.includes(city)) return false;
  return getDistricts(province, city).includes(district);
}
