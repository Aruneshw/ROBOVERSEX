/**
 * Task flow for the arena: sequential unlock, per-task code drafts, Submit gating and auto-advance.
 *
 *   const [code, setCode] = useState("");               // your editor value (Monaco onChange → setCode)
 *   const flow = useTaskFlow({ participantId: user.id, code, setCode });
 *   <button disabled={!flow.canSubmit} onClick={flow.submit}>SUBMIT RUN</button>
 *
 * Rules: a task unlocks when every task before it is passed. SUBMIT is enabled only when the last run of the
 * CURRENT task passed every check AND the editor still contains exactly the code that was run. Submitting records
 * the pass (localStorage, plus your optional onSubmit for the server) and moves to the next task.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { rvx, useRvx } from "./runtime";
import { pendingChecks, tasksFor, type ArenaTask, type CheckResult, type TaskEvaluation } from "./tasks";

export type TaskState = "locked" | "available" | "current" | "passed";
export type FlowTask = { task: ArenaTask; state: TaskState; index: number; passedAt: number | null; score: number | null };
type Progress = Record<string, { at: number; score: number | null }>;

export type TaskFlowOptions = {
  /** stable id of the participant (team code / user id): picks the Task-4 card and keys saved progress */
  participantId: string;
  /** override the task list (default: tasksFor(participantId)) */
  tasks?: ArenaTask[];
  /** current editor contents (React state bound to your editor) */
  code: string;
  /** replace editor contents (called when a task becomes current: saved draft or starter code) */
  setCode: (code: string) => void;
  /** organiser preview: every task selectable (default false = sequential unlock) */
  unlockAll?: boolean;
  /** optional: send the passing run to your backend; throw to keep the task open */
  onSubmit?: (task: ArenaTask, evaluation: TaskEvaluation) => Promise<void> | void;
};

const read = <T,>(k: string, fallback: T): T => {
  try { const v = globalThis.localStorage?.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

/** progress lives in localStorage; this store makes it reactive (and SSR-safe) */
const EMPTY: Progress = {};
const progressCache = new Map<string, Progress>();
const progressSubs = new Set<() => void>();
const progressStore = {
  subscribe: (cb: () => void) => { progressSubs.add(cb); return () => { progressSubs.delete(cb); }; },
  get: (key: string): Progress => {
    if (!progressCache.has(key)) progressCache.set(key, read<Progress>(key, {}));
    return progressCache.get(key)!;
  },
  set: (key: string, p: Progress) => { progressCache.set(key, p); write(key, p); progressSubs.forEach((f) => f()); },
};

export function useTaskFlow(o: TaskFlowOptions) {
  const tasks = useMemo(() => o.tasks ?? tasksFor(o.participantId), [o.tasks, o.participantId]);
  const keyP = `rvx.progress.${o.participantId}`;
  const keyD = (id: string) => `rvx.draft.${o.participantId}.${id}`;
  const progress = useSyncExternalStore(progressStore.subscribe, () => progressStore.get(keyP), () => EMPTY);
  /** task picked by the participant; null = "first unfinished task" (so a submit auto-advances) */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const opts = useRef(o);
  useEffect(() => { opts.current = o; });
  const s = useRvx();

  const firstOpen = tasks.find((t) => !progress[t.id]) ?? tasks[tasks.length - 1];
  const current = tasks.find((t) => t.id === chosenId) ?? firstOpen;
  const currentId = current.id;

  // whenever the current task changes: configure the arena and load its draft/starter into the editor
  useEffect(() => {
    const task = tasks.find((t) => t.id === currentId);
    if (!task) return;
    rvx.setTask(task);
    opts.current.setCode(read<string | null>(`rvx.draft.${opts.current.participantId}.${task.id}`, null) ?? task.starterCode);
  }, [currentId, tasks]);

  const unlocked = (i: number) => !!o.unlockAll || tasks.slice(0, i).every((t) => progress[t.id]);
  const list: FlowTask[] = tasks.map((task, index) => ({
    task, index,
    state: progress[task.id] ? "passed" : task.id === currentId ? "current" : unlocked(index) ? "available" : "locked",
    passedAt: progress[task.id]?.at ?? null,
    score: progress[task.id]?.score ?? null,
  }));

  /** Switch task (ignored for locked tasks). Saves the current draft first. */
  const select = (id: string) => {
    const i = tasks.findIndex((t) => t.id === id);
    if (i < 0 || !unlocked(i) || id === currentId) return;
    write(keyD(currentId), o.code);
    setSubmitError(null);
    setChosenId(id);
  };
  /** Call from your editor's onChange so each task keeps its own code. */
  const saveDraft = (code: string) => write(keyD(currentId), code);

  const evaluation = s.evaluation && s.evaluation.taskId === current.id ? s.evaluation : null;
  const checks: CheckResult[] = evaluation?.checks ?? pendingChecks(current);
  const codeMatches = !!evaluation && evaluation.code === o.code;
  const busy = s.activity === "running" || s.activity === "installing" || s.activity === "booting";
  const alreadyPassed = !!progress[current.id];
  const canSubmit = !!evaluation?.passed && codeMatches && !busy && !submitting && !alreadyPassed;
  /** why Submit is disabled — show it as the button tooltip / hint */
  const submitHint = alreadyPassed ? "Task already completed"
    : busy ? "Wait for the run to finish"
    : !evaluation ? "Run your code first"
    : !evaluation.passed ? "Complete all criteria to enable submission"
    : !codeMatches ? "Code changed since the last run — run it again"
    : "Submit this run";

  const submit = async () => {
    if (!canSubmit || !evaluation) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await opts.current.onSubmit?.(current, evaluation);
      write(keyD(current.id), evaluation.code);
      progressStore.set(keyP, { ...progress, [current.id]: { at: Date.now(), score: evaluation.score } });
      setChosenId(null);          // → first unfinished task, i.e. the next one
    } catch (e) {
      setSubmitError((e as Error).message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const completed = tasks.filter((t) => progress[t.id]).length;
  return {
    tasks: list, current, select, saveDraft, evaluation, checks,
    canSubmit, submitHint, submit, submitting, submitError,
    completed, total: tasks.length, allDone: completed === tasks.length,
    /** organiser/testing helper: forget all progress for this participant */
    resetProgress: () => { progressStore.set(keyP, {}); setChosenId(null); },
  };
}
