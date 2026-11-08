// Shared by the /api/entry routes (#71).
import { NextResponse } from 'next/server';

export const reply = (out: any) => (out?.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out?.status ?? 500 }));
export const body = (req: Request) => req.json().catch(() => null);
export type IdCtx = { params: Promise<{ id: string }> };
