const PK_SELECTED_CODES_STORAGE_KEY = "fund-pk:selectedCodes";

export function normalizePkSelectedCodes(codes: string[]) {
  const uniqueCodes = Array.from(
    new Set(
      codes
        .map((code) => code.trim())
        .filter((code) => /^\d{6}$/.test(code)),
    ),
  );

  return uniqueCodes.slice(0, 5);
}

export function readPkSelectedCodes() {
  if (typeof window === "undefined") return [];

  const raw = localStorage.getItem(PK_SELECTED_CODES_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizePkSelectedCodes(parsed) : [];
  } catch {
    return [];
  }
}

export function writePkSelectedCodes(codes: string[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    PK_SELECTED_CODES_STORAGE_KEY,
    JSON.stringify(normalizePkSelectedCodes(codes)),
  );
}
