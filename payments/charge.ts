export function chargeInMinorUnits(amount: number): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }

  return amount;
}
