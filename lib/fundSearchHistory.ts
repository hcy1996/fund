export type FundSearchHistoryEntry = {
  code: string;
  name?: string;
  count: number;
  lastAt: number;
};

const MAX_LOCAL_HISTORY = 30;

function isValidFundCode(code: string) {
  return /^\d{6}$/.test(code);
}

function getStorageKey(scopeKey: string) {
  return `fund-search:history:${scopeKey}`;
}

function getAnonScopeKey() {
  return "anon";
}

export function readFundSearchHistory(scopeUserId?: string | null): FundSearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const scopeKey = scopeUserId ?? getAnonScopeKey();
  const raw = localStorage.getItem(getStorageKey(scopeKey));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const list = parsed
      .map((x) => x as Partial<FundSearchHistoryEntry>)
      .filter((x) => typeof x.code === "string" && isValidFundCode(x.code))
      .map((x) => ({
        code: x.code!,
        name: typeof x.name === "string" && x.name.trim() ? x.name.trim() : undefined,
        count: typeof x.count === "number" && x.count > 0 ? x.count : 0,
        lastAt: typeof x.lastAt === "number" && x.lastAt > 0 ? x.lastAt : 0,
      }))
      .filter((x) => x.count > 0 && x.lastAt > 0);

    // newest first
    list.sort((a, b) => b.lastAt - a.lastAt);
    return list.slice(0, MAX_LOCAL_HISTORY);
  } catch {
    return [];
  }
}

export function recordFundSearchHistory(
  scopeUserId: string | null | undefined,
  codeRaw: string,
  nameRaw?: string | null,
) {
  if (typeof window === "undefined") return;
  const code = codeRaw.trim();
  if (!isValidFundCode(code)) return;
  const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined;

  const scopeKey = scopeUserId ?? getAnonScopeKey();
  const key = getStorageKey(scopeKey);
  const now = Date.now();

  const current = readFundSearchHistory(scopeUserId);
  const idx = current.findIndex((x) => x.code === code);
  let next: FundSearchHistoryEntry[];
  if (idx >= 0) {
    const entry = current[idx]!;
    const updated: FundSearchHistoryEntry = {
      ...entry,
      name: entry.name ?? name,
      count: entry.count + 1,
      lastAt: now,
    };
    next = [updated, ...current.filter((x) => x.code !== code)];
  } else {
    next = [{ code, name, count: 1, lastAt: now }, ...current];
  }
  next = next.slice(0, MAX_LOCAL_HISTORY);
  localStorage.setItem(key, JSON.stringify(next));
}

export function deleteFundSearchHistoryEntry(scopeUserId: string | null | undefined, codeRaw: string) {
  if (typeof window === "undefined") return;
  const code = codeRaw.trim();
  if (!isValidFundCode(code)) return;

  const scopeKey = scopeUserId ?? getAnonScopeKey();
  const key = getStorageKey(scopeKey);

  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    const next = parsed
      .map((x) => x as Partial<FundSearchHistoryEntry>)
      .filter((x) => typeof x.code === "string" && isValidFundCode(x.code) && x.code !== code);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

