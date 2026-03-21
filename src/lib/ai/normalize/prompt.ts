export function buildPrompt(titles: string[], queryContext?: string): string {
  const promptLines = [
    'You are a PC hardware catalog normalization engine.',
    'Given raw product titles from different stores, return canonical titles for strict product grouping across ALL product types.',
    'Rules:',
    '1) Keep brand + exact model/chipset/GPU/CPU + exact variant + exact capacity.',
    '2) Remove noise words like Placa de Video, VGA, Gamer, Oferta, OEM, Box.',
    '3) Never merge different products. RTX 4060 != RTX 4060 Ti.',
    '4) CPU suffix is mandatory and changes product identity: 5600 != 5600G != 5600GT != 5600X.',
    '5) Keep board/AIB line variants when present: ASUS Prime != ASUS Dual, Gigabyte Aorus != Gigabyte DS3H.',
    '6) Apply the same strictness to peripherals and accessories: Logitech K120 != Logitech K380, G502 != G502 X.',
    '7) Same exact hardware must produce the exact same canonical title string.',
    '8) Same exact product family from different stores should collapse to one canonical title.',
    '9) Use concise title case.',
  ];

  if (queryContext?.trim()) {
    promptLines.push(`Search query context: ${queryContext.trim()}`);
  }

  promptLines.push(
    `Raw titles JSON: ${JSON.stringify(titles)}`,
  );

  return promptLines.join('\n');
}
