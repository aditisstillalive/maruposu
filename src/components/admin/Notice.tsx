export default function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`p-3 rounded-lg border text-sm ${ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {children}
    </div>
  );
}
