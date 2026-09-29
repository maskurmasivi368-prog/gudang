// Offline FIFO journal per POS user/store. Mutations are queued BEFORE being
// acknowledged; retries reuse the exact same method/path/body (including the
// stable request_id inside body), per the MASIVI integration contract.

import { storage } from "@/src/utils/storage";
import { posFetch, uuid } from "@/src/pos";

export interface Job {
  id: string;
  path: string;
  method: "POST" | "PUT";
  body: unknown;
  created_at: string;
  attempts: number;
}

const jkey = (userId: string, storeId: string) => `pos_journal_${userId}_${storeId}`;

async function readJobs(userId: string, storeId: string): Promise<Job[]> {
  const raw = await storage.getItem<string>(jkey(userId, storeId), "[]");
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJobs(userId: string, storeId: string, jobs: Job[]) {
  await storage.setItem(jkey(userId, storeId), JSON.stringify(jobs));
}

export async function journalCount(userId: string, storeId: string): Promise<number> {
  return (await readJobs(userId, storeId)).length;
}

function isFatal(status: number) {
  // Business/identity errors must not be retried blindly.
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 422;
}

// Process the queue FIFO until `targetId` completes. Returns that job's
// response (the canonical server document/state).
export async function mutate<T>(
  userId: string,
  storeId: string,
  path: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<T> {
  const job: Job = {
    id: uuid(),
    path,
    method,
    body,
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  const jobs = await readJobs(userId, storeId);
  jobs.push(job);
  await writeJobs(userId, storeId, jobs);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const queue = await readJobs(userId, storeId);
    const cur = queue[0];
    if (!cur) throw new Error("Antrean kosong");
    try {
      const r = await posFetch<T>(cur.path, {
        method: cur.method,
        body: JSON.stringify(cur.body),
      });
      // Atomic commit: drop the job only after the server accepted it.
      await writeJobs(userId, storeId, queue.slice(1));
      if (cur.id === job.id) return r;
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      const fresh = await readJobs(userId, storeId);
      if (fresh[0]) {
        fresh[0].attempts += 1;
        // Fatal errors (incl. 409 conflict) are dropped and surfaced so the
        // officer reloads/reconciles; transient errors stay queued.
        if (isFatal(status)) {
          await writeJobs(userId, storeId, fresh.slice(1));
        } else {
          await writeJobs(userId, storeId, fresh);
        }
      }
      throw e;
    }
  }
}

// Best-effort background flush (e.g. on app start). Never throws.
export async function flushQueue(userId: string, storeId: string): Promise<number> {
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const queue = await readJobs(userId, storeId);
      const cur = queue[0];
      if (!cur) return 0;
      await posFetch(cur.path, { method: cur.method, body: JSON.stringify(cur.body) });
      await writeJobs(userId, storeId, queue.slice(1));
    }
  } catch (e) {
    const status = (e as { status?: number }).status ?? 0;
    if (isFatal(status)) {
      const queue = await readJobs(userId, storeId);
      await writeJobs(userId, storeId, queue.slice(1));
    }
    return journalCount(userId, storeId);
  }
}
