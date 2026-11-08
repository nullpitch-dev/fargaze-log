'use client';

// /entry/plan/<id> — Adjust a plan (#71 step 2, Design §15.7). The #70 form in 'plan' mode:
// a start still to come keeps it a plan; a start that has passed makes it a record.

import { useParams } from 'next/navigation';
import { RecordEditor } from '@/app/records/_components/RecordEditor';

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  return <RecordEditor id={id} mode="plan" />;
}
