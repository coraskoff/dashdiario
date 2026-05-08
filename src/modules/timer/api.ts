import { supabase } from "@/integrations/supabase/client";
import type { ProjectGoal, TimerGoal, TimerSession } from "./types";

export async function fetchSessions(sinceIso?: string): Promise<TimerSession[]> {
  let q = supabase
    .from("timer_sessions")
    .select("*")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(2000);
  if (sinceIso) q = q.gte("started_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TimerSession[];
}

export async function createSession(input: {
  project_id: string | null;
  tag: string | null;
  mode: TimerSession["mode"];
  planned_seconds: number | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  completed: boolean;
}): Promise<TimerSession> {
  const { data, error } = await supabase
    .from("timer_sessions")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as TimerSession;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from("timer_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchGoal(): Promise<TimerGoal | null> {
  const { data, error } = await supabase
    .from("timer_goals")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as TimerGoal) ?? null;
}

export async function setGoal(weekly_seconds: number): Promise<TimerGoal> {
  const existing = await fetchGoal();
  if (existing) {
    const { data, error } = await supabase
      .from("timer_goals")
      .update({ weekly_seconds })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as TimerGoal;
  }
  const { data, error } = await supabase
    .from("timer_goals")
    .insert({ weekly_seconds })
    .select()
    .single();
  if (error) throw error;
  return data as TimerGoal;
}

export async function fetchProjectGoals(): Promise<ProjectGoal[]> {
  const { data, error } = await supabase.from("timer_project_goals").select("*");
  if (error) throw error;
  return (data ?? []) as ProjectGoal[];
}

export async function setProjectGoal(
  project_id: string,
  weekly_seconds: number,
): Promise<void> {
  if (weekly_seconds <= 0) {
    const { error } = await supabase
      .from("timer_project_goals")
      .delete()
      .eq("project_id", project_id);
    if (error) throw error;
    return;
  }
  // upsert by project_id
  const { error } = await supabase
    .from("timer_project_goals")
    .upsert({ project_id, weekly_seconds }, { onConflict: "project_id" });
  if (error) throw error;
}