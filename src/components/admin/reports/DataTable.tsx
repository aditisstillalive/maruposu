type Cell = React.ReactNode;
export type Column = { label: string; numeric?: boolean };

/** The plain report table: numeric columns right-aligned with tabular figures, optional total row. */
export default function DataTable({ columns, rows, total, empty = 'Tidak ada data di periode ini.' }: { columns: Column[]; rows: Cell[][]; total?: Cell[]; empty?: string }) {
  if (!rows.length) return <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const cls = (c: Column) => (c.numeric ? 'text-right tabular-nums whitespace-nowrap' : '');
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map(c => <th key={c.label} className={`p-3 font-medium ${c.numeric ? 'text-right' : ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
              {r.map((cell, j) => j === 0 ? <th key={j} scope="row" className="p-3 text-left font-normal">{cell}</th> : <td key={j} className={`p-3 ${cls(columns[j])}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              {total.map((cell, j) => j === 0 ? <th key={j} scope="row" className="p-3 text-left">{cell}</th> : <td key={j} className={`p-3 ${cls(columns[j])}`}>{cell}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
