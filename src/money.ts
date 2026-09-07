export interface MoneyInput {
  /** The day's balance as a sensor reads it: negative when the day earned. */
  balance?: number;
  exported?: number;
  imported?: number;
  exportKwh?: number;
  importKwh?: number;
  priceImport?: number;
  priceExport?: number;
}

export interface MoneyView {
  balance?: number;
  exported?: number;
  imported?: number;
  /** True when at least one figure was worked out rather than read. */
  derived: boolean;
}

const known = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

/**
 * What the day is worth. A sensor always wins; the rest is arithmetic anyone
 * would do on paper, which saves three entity pickers on a fixed tariff. On a
 * spot tariff the price moves through the day and only an integration that
 * accumulates as it goes can be right, so the prices are left to the owner.
 */
export function moneyView(input: MoneyInput): MoneyView {
  let derived = false;

  let exported = input.exported;
  if (!known(exported) && known(input.priceExport) && known(input.exportKwh)) {
    exported = input.priceExport * input.exportKwh;
    derived = true;
  }

  let imported = input.imported;
  if (!known(imported) && known(input.priceImport) && known(input.importKwh)) {
    imported = input.priceImport * input.importKwh;
    derived = true;
  }

  let balance = input.balance;
  if (!known(balance) && (known(exported) || known(imported))) {
    balance = (known(imported) ? imported : 0) - (known(exported) ? exported : 0);
    derived = true;
  }

  return {
    balance: known(balance) ? balance : undefined,
    exported: known(exported) ? exported : undefined,
    imported: known(imported) ? imported : undefined,
    derived
  };
}
