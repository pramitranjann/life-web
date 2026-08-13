import { NextRequest, NextResponse } from "next/server";

import { OWNER_ID } from '@/lib/life/constants'
import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { inferEntryKind } from '@/lib/life/entries'
import { detectProjectSlug, normalizeProjectSlug } from '@/lib/life/projects'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { createManualTask } from '@/lib/life/tasks'
import { getCurrentLocalDate } from '@/lib/life/time'
import type { EntrySource } from '@/lib/life/types'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const settings = await getOwnerSettings();
  const date = request.nextUrl.searchParams.get("date") || getCurrentLocalDate(settings.timezone);
  const order = request.nextUrl.searchParams.get("order") === "asc" ? true : false;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("local_date", date)
    .order("created_at", { ascending: order });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    localDate: date,
    timezone: settings.timezone,
    entries: data || [],
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const contentType = request.headers.get("content-type") || "";
  const isJsonRequest = contentType.includes("application/json");
  let content = "";
  let source: EntrySource = "voice";
  let projectSlug: string | null = null;

  if (isJsonRequest) {
    const body = (await request.json().catch(() => null)) as { content?: string; source?: EntrySource; projectSlug?: string | null } | null;
    content = body?.content?.trim() || "";
    source = body?.source === "text" ? "text" : "voice";
    projectSlug = normalizeProjectSlug(body?.projectSlug) || null;
  } else {
    const formData = await request.formData().catch(() => null);
    content = typeof formData?.get("content") === "string" ? String(formData.get("content")).trim() : "";
    source = formData?.get("source") === "voice" ? "voice" : "text";
    projectSlug = normalizeProjectSlug(typeof formData?.get("projectSlug") === "string" ? String(formData.get("projectSlug")) : null) || null;
  }

  if (!content) {
    if (!isJsonRequest) {
      return NextResponse.redirect(new URL("/?error=content", request.url), { status: 303 });
    }
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  const settings = await getOwnerSettings();
  const localDate = getCurrentLocalDate(settings.timezone);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: OWNER_ID,
      content,
      source,
      project_slug: projectSlug || detectProjectSlug(content),
      local_date: localDate,
    })
    .select("*")
    .single();

  if (error) {
    if (!isJsonRequest) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error.message)}`, request.url), { status: 303 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // When a captured entry reads like a task, mirror it into the task list so it
  // becomes something actionable. Until now the "Task" label was purely cosmetic
  // and nothing was ever created. Best-effort: never let this fail the capture.
  if (inferEntryKind(content) === "Task") {
    try {
      await createManualTask({
        title: content,
        projectSlug: projectSlug || detectProjectSlug(content),
      });
    } catch (taskError) {
      console.error("Failed to create task from entry", taskError);
    }
  }

  if (!isJsonRequest) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }

  return NextResponse.json({
    localDate,
    timezone: settings.timezone,
    entry: data,
  });
}
