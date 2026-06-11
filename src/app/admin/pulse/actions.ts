"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PULSE_CATEGORIES, type PulseCategory } from "@/lib/data/pulse";
import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const optionalString = (value: FormDataEntryValue | null) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
};

const normalizeCode = (value: FormDataEntryValue | null) => optionalString(value)?.toUpperCase() ?? null;

const normalizeCategory = (value: FormDataEntryValue | null): PulseCategory => {
  const text = optionalString(value);
  if (text && PULSE_CATEGORIES.includes(text as PulseCategory)) {
    return text as PulseCategory;
  }
  return "Matchday";
};

const safeHref = (value: string | null) => {
  if (!value) return null;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const redirectWithError = (error: string, editId?: string | null) => {
  const suffix = editId ? `&edit=${encodeURIComponent(editId)}` : "";
  redirect(`/admin/pulse?error=${error}${suffix}`);
};

export async function savePulsePost(formData: FormData) {
  const admin = await requireAdminUser("/admin/pulse");
  const postId = optionalString(formData.get("post_id"));
  const title = optionalString(formData.get("title"));
  const summary = optionalString(formData.get("summary"));

  if (!title || !summary) {
    redirectWithError("missing_required", postId);
  }

  const ctaHref = safeHref(optionalString(formData.get("cta_href")));
  if (optionalString(formData.get("cta_href")) && !ctaHref) {
    redirectWithError("unsafe_cta", postId);
  }

  const sourceUrl = safeHref(optionalString(formData.get("source_url")));
  if (optionalString(formData.get("source_url")) && (!sourceUrl || sourceUrl.startsWith("/"))) {
    redirectWithError("unsafe_source", postId);
  }

  const isPublished = formData.get("is_published") === "on";
  const payload = {
    title,
    summary,
    body: optionalString(formData.get("body")),
    category: normalizeCategory(formData.get("category")),
    country_code: normalizeCode(formData.get("country_code")),
    home_team_code: normalizeCode(formData.get("home_team_code")),
    away_team_code: normalizeCode(formData.get("away_team_code")),
    match_id: optionalString(formData.get("match_id")),
    source_name: optionalString(formData.get("source_name")),
    source_url: sourceUrl,
    cta_label: optionalString(formData.get("cta_label")),
    cta_href: ctaHref,
    is_pinned: formData.get("is_pinned") === "on",
    is_published: isPublished,
    created_by: admin.id,
  };

  const supabase = createAdminClient();
  const query = postId
    ? supabase.from("pulse_posts").update(payload).eq("id", postId)
    : supabase.from("pulse_posts").insert(payload);

  const { error } = await query;
  if (error) {
    console.error("Pulse save failed", { message: error.message, code: error.code });
    redirectWithError("save_failed", postId);
  }

  revalidatePath("/admin/pulse");
  revalidatePath("/pulse");
  revalidatePath("/dashboard");
  redirect(`/admin/pulse?saved=${isPublished ? "published" : "draft"}`);
}

export async function setPulsePostPublished(formData: FormData) {
  await requireAdminUser("/admin/pulse");
  const postId = optionalString(formData.get("post_id"));
  const isPublished = formData.get("is_published") === "true";
  if (!postId) redirect("/admin/pulse?error=missing_post");

  const { error } = await createAdminClient()
    .from("pulse_posts")
    .update({ is_published: isPublished })
    .eq("id", postId);

  if (error) {
    console.error("Pulse publish toggle failed", { message: error.message, code: error.code });
    redirect("/admin/pulse?error=save_failed");
  }

  revalidatePath("/admin/pulse");
  revalidatePath("/pulse");
  revalidatePath("/dashboard");
  redirect(`/admin/pulse?saved=${isPublished ? "published" : "unpublished"}`);
}

export async function setPulsePostPinned(formData: FormData) {
  await requireAdminUser("/admin/pulse");
  const postId = optionalString(formData.get("post_id"));
  const isPinned = formData.get("is_pinned") === "true";
  if (!postId) redirect("/admin/pulse?error=missing_post");

  const { error } = await createAdminClient()
    .from("pulse_posts")
    .update({ is_pinned: isPinned })
    .eq("id", postId);

  if (error) {
    console.error("Pulse pin toggle failed", { message: error.message, code: error.code });
    redirect("/admin/pulse?error=save_failed");
  }

  revalidatePath("/admin/pulse");
  revalidatePath("/pulse");
  revalidatePath("/dashboard");
  redirect(`/admin/pulse?saved=${isPinned ? "pinned" : "unpinned"}`);
}

export async function deletePulsePost(formData: FormData) {
  await requireAdminUser("/admin/pulse");
  const postId = optionalString(formData.get("post_id"));
  if (!postId) redirect("/admin/pulse?error=missing_post");

  const { error } = await createAdminClient().from("pulse_posts").delete().eq("id", postId);
  if (error) {
    console.error("Pulse delete failed", { message: error.message, code: error.code });
    redirect("/admin/pulse?error=delete_failed");
  }

  revalidatePath("/admin/pulse");
  revalidatePath("/pulse");
  revalidatePath("/dashboard");
  redirect("/admin/pulse?saved=deleted");
}
