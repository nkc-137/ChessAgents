export async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

export function splitMultiGamePgn(raw: string): string[] {
  // naive split on blank-line-separated headers; good enough for MVP
  const chunks = raw.split(/\n\s*\n(?=\s*\[Event )/g);
  return chunks.map(s => s.trim()).filter(Boolean);
}