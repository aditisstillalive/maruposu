/* eslint-disable @next/next/no-img-element */
export default function EmployeeAvatar({ name, photoUrl, size = 'lg' }: { name: string; photoUrl: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-8 w-8 text-xs';
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={`${box} rounded-full object-cover`} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
  return (
    <span className={`${box} flex items-center justify-center rounded-full bg-brand-soft font-medium text-brand-strong`} aria-hidden>
      {initials}
    </span>
  );
}
