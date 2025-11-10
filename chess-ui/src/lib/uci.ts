export type ParsedInfo = {
  depth?: number;
  multiPv?: number;
  score?: { cp?: number; mate?: number };
  pv?: string[]; // UCI moves
};

export function parseInfo(line: string): ParsedInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const out: ParsedInfo = {};
  for (let i = 1; i < t.length; i++) {
    if (t[i] === 'depth') out.depth = toInt(t[++i]);
    else if (t[i] === 'multipv') out.multiPv = toInt(t[++i]);
    else if (t[i] === 'score') {
      const typ = t[++i];
      const val = toInt(t[++i]);
      if (typ === 'cp') out.score = { cp: val };
      else if (typ === 'mate') out.score = { mate: val };
    } else if (t[i] === 'pv') {
      out.pv = t.slice(i + 1);
      break;
    }
  }
  return out;
}

function toInt(s?: string) { return s ? parseInt(s, 10) : undefined; }