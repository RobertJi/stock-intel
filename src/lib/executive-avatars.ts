const EXECUTIVE_AVATARS: Record<string, string> = {
  "javier olivan": "/executives/javier-olivan.webp",
  "olivan javier": "/executives/javier-olivan.webp",
  "susan li": "/executives/susan-li.webp",
  "li susan j": "/executives/susan-li.webp",
  "robert kimmitt": "/executives/robert-kimmitt.webp",
  "kimmitt robert m": "/executives/robert-kimmitt.webp",
  "peggy alford": "/executives/peggy-alford.webp",
  "alford peggy": "/executives/peggy-alford.webp",
  "colette kress": "/executives/colette-kress.webp",
  "kress colette": "/executives/colette-kress.webp",
  "ajay puri": "/executives/ajay-puri.webp",
  "puri ajay k": "/executives/ajay-puri.webp",
  "donald robertson": "/executives/donald-robertson.webp",
  "robertson donald f jr": "/executives/donald-robertson.webp",
  "aarti shah": "/executives/aarti-shah.webp",
  "shah aarti s.": "/executives/aarti-shah.webp",
  "reed hastings": "/executives/reed-hastings.webp",
  "hastings reed": "/executives/reed-hastings.webp",
  "spencer neumann": "/executives/spencer-neumann.webp",
  "neumann spencer adam": "/executives/spencer-neumann.webp",
  "mark stevens": "/executives/mark-stevens.webp",
  "mark a stevens": "/executives/mark-stevens.webp",
  "stevens mark a": "/executives/mark-stevens.webp",
  "john dabiri": "/executives/john-dabiri.webp",
  "dabiri john": "/executives/john-dabiri.webp",
};

function normalizeExecutiveName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getExecutiveAvatar(name: string) {
  return EXECUTIVE_AVATARS[normalizeExecutiveName(name)] ?? null;
}
