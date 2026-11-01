/** A QR that no longer works (table removed, deactivated or given a new QR). */
export default function QrInvalid() {
  return (
    <main className="flex min-h-full items-center justify-center p-6 text-center">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-light">QR meja tidak berlaku</h1>
        <p className="text-sm text-gray-500">Silakan minta bantuan kasir atau pesan langsung di kasir.</p>
      </div>
    </main>
  );
}
