'use client';

// /records/<id> — edit one record (#70 step 3). Opened from the record pane's Edit button.

import { useParams } from 'next/navigation';
import { RecordEditor } from '../_components/RecordEditor';

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  return <RecordEditor id={id} />;
}
