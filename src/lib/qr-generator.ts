'use client';

import QRCode from 'qrcode';

export interface QrGeneratorOptions {
  data: string;
  size?: number;
  logoUrl?: string;
  fgColor?: string;
  bgColor?: string;
  style?: 'rounded' | 'dots' | 'classy' | 'classic';
}

export async function generateQrCode(options: QrGeneratorOptions): Promise<string> {
  const {
    data,
    size = 300,
    fgColor = '#1e1b4b',
    bgColor = '#ffffff',
  } = options;

  const dataUrl = await QRCode.toDataURL(data, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: fgColor,
      light: bgColor,
    },
  });

  return dataUrl;
}
