"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/lib/supabase/auth";

export async function signOutAction() {
  await signOut();
  redirect("/entrar");
}
