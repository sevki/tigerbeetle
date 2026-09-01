// Formats a u128 decimal-string amount using a resolved `currency` (Account/Transfer's
// optional `currency` field, from wasm-worker's /codes registry -- see API.md's "Names and
// codes"). Falls back to the raw amount when nothing is registered for that (ledger, code).
export function formatAmount(
  amount: string,
  currency?: { symbol: string; decimals: number },
): string {
  if (!currency) return amount;
  if (currency.decimals === 0) return `${currency.symbol}${amount}`;

  const value = BigInt(amount);
  const divisor = 10n ** BigInt(currency.decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(currency.decimals, "0");
  return `${currency.symbol}${whole}.${fraction}`;
}
