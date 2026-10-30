export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}Rp ${Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
