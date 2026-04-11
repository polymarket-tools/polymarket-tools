// ---------------------------------------------------------------------------
// Transak URL generator for fiat-to-USDC onramp
// ---------------------------------------------------------------------------

export interface TransakUrlParams {
  apiKey: string;
  walletAddress: string;
  fiatAmount?: number;
}

/**
 * Generate a Transak onramp URL pre-configured for USDC on Polygon.
 *
 * Opens in Telegram's WebView when used with an inline keyboard url button.
 */
export function generateTransakUrl(params: TransakUrlParams): string {
  const url = new URL('https://global.transak.com/');
  url.searchParams.set('apiKey', params.apiKey);
  url.searchParams.set('cryptoCurrencyCode', 'USDC');
  url.searchParams.set('network', 'polygon');
  url.searchParams.set('walletAddress', params.walletAddress);
  url.searchParams.set('defaultFiatAmount', String(params.fiatAmount ?? 50));
  return url.toString();
}
