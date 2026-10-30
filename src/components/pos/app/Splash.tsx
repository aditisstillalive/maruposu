import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { site } from '@/lib/site';

export default function Splash({ text }: { text?: string }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-gray-50 p-6 text-center">
      <Image src={site.logo} alt={site.name} width={487} height={284} priority className="h-auto w-48" />
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      {text && <p className="max-w-sm text-sm text-gray-500">{text}</p>}
    </main>
  );
}
