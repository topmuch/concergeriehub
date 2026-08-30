const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0,O,1,I to avoid confusion

export function generateActivationCode(): string {
  let code = 'QR-';
  for (let i = 0; i < 8; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

export function generateUniqueCodes(
  quantity: number,
  existingCodes: string[] = []
): string[] {
  const codes: string[] = [];
  const existing = new Set(existingCodes);
  let attempts = 0;
  const maxAttempts = quantity * 10;

  while (codes.length < quantity && attempts < maxAttempts) {
    const code = generateActivationCode();
    if (!existing.has(code) && !codes.includes(code)) {
      codes.push(code);
      existing.add(code);
    }
    attempts++;
  }

  if (codes.length < quantity) {
    throw new Error(`Could not generate ${quantity} unique codes after ${maxAttempts} attempts`);
  }

  return codes;
}