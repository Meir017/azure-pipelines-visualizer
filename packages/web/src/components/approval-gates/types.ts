export interface TimelineRecord {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  state: string;
  result: string | null;
  startTime: string | null;
  finishTime: string | null;
  order: number;
  identifier: string | null;
  workerName: string | null;
  issues: { type: string; message: string }[] | null;
  log: { id: number; url: string } | null;
  details: { id: string; url: string } | null;
}

export interface ProcessedRow {
  id: string;
  name: string;
  type: 'stage' | 'checkpoint' | 'approval' | 'check';
  state: string;
  result: string | null;
  startTime: Date | null;
  finishTime: Date | null;
  waitDurationMs: number;
  execDurationMs: number;
  parentStageName: string | null;
  raw: TimelineRecord;
}
