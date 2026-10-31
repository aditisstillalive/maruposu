import R2Photo from '@/components/R2Photo';

export default function EmployeeAvatar({ name, photoUrl, size = 'lg' }: { name: string; photoUrl: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-8 w-8 text-xs';
  if (photoUrl) {
    return (
      <span className={`${box} relative block shrink-0 overflow-hidden rounded-full`}>
        <R2Photo src={photoUrl} sizes={size === 'lg' ? '80px' : '32px'} />
      </span>
    );
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
