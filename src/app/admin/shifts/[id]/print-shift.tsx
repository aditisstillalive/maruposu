'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ShiftReport from '@/components/pos/print/ShiftReport';
import { printNode } from '@/components/pos/print/printNode';
import type { ClosedShift } from '@/lib/pos/client/db';
import type { Snapshot, SnapshotEmployee } from '@/lib/pos/types';

export default function PrintShift({ closed, setting, employees }: { closed: ClosedShift; setting: Snapshot['setting']; employees: SnapshotEmployee[] }) {
  return (
    <Button variant="outline" onClick={() => printNode(<ShiftReport closed={closed} setting={setting} employees={employees} />)}>
      <Printer /> Cetak laporan
    </Button>
  );
}
