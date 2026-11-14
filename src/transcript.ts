export type Segment = {
  idx: number;
  speaker: string | null;
  atSeconds: number | null;
  text: string;
};

// "[00:12:34]", "(12:34)", "12:34" hoặc "00:12:34" ở đầu dòng, có thể kèm "-" phía sau.
const TIMESTAMP = /^[\[(]?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[\])]?\s*[-–]?\s*/;
// "Tên người nói:" — tối đa 40 ký tự, không chứa dấu câu kết thúc câu.
const SPEAKER = /^([^:.!?\n]{1,40}?)\s*:\s+/;

/**
 * Tách phiên âm dán vào thành các đoạn. Chấp nhận các dạng thường gặp:
 *   [00:12] Lan: nội dung
 *   12:34 Lan: nội dung
 *   Lan: nội dung
 *   nội dung không có người nói (nối vào đoạn trước nếu có)
 */
export function parseTranscript(raw: string): Segment[] {
  const segments: Segment[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;

    let atSeconds: number | null = null;
    const ts = TIMESTAMP.exec(line);
    if (ts) {
      atSeconds = Number(ts[1] ?? 0) * 3600 + Number(ts[2]) * 60 + Number(ts[3]);
      line = line.slice(ts[0].length);
    }

    let speaker: string | null = null;
    const sp = SPEAKER.exec(line);
    if (sp) {
      speaker = sp[1]!.trim();
      line = line.slice(sp[0].length);
    }

    line = line.trim();
    if (!line) continue;

    const prev = segments[segments.length - 1];
    if (prev && speaker === null && atSeconds === null) {
      prev.text += ` ${line}`;
      continue;
    }
    segments.push({ idx: segments.length, speaker, atSeconds, text: line });
  }
  return segments;
}

/** Chuẩn hóa để so khớp văn bản: NFC, gộp khoảng trắng, chữ thường. */
export function normalizeText(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}
