import type { SupabaseClient, Session, User } from "@supabase/supabase-js";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      getSession(): Promise<{ session: Session | null; user: User | null }>;
      getAccessToken(): Promise<string | null>;
    }
    interface PageData {
      user: User | null;
      accessToken: string | null;
    }
  }
}

export {};
