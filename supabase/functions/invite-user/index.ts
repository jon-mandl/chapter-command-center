import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerSettings } = await callerClient
      .from("user_settings")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerSettings || callerSettings.role !== "admin") {
      return json({ error: "Only admins can manage users" }, 403);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the body once
    const body = await req.json();

    // Determine action from body.action, query param, or default "invite"
    const url = new URL(req.url);
    const action = body.action || url.searchParams.get("action") || "invite";

    // ==================== DELETE USER ====================
    if (action === "delete") {
      const { user_id } = body;

      if (!user_id) return json({ error: "user_id is required" }, 400);

      if (user_id === caller.id) {
        return json({ error: "You cannot delete your own account" }, 400);
      }

      // Delete user_settings first (may not exist — that's fine)
      await adminClient
        .from("user_settings")
        .delete()
        .eq("user_id", user_id);

      // Delete from auth.users
      const { error: authDeleteError } = await adminClient.auth.admin
        .deleteUser(user_id);

      if (authDeleteError) {
        const msg = authDeleteError.message?.toLowerCase() || "";
        // If user doesn't exist, treat as success (already gone)
        if (msg.includes("not found") || msg.includes("not_found") || msg.includes("no user")) {
          return json({ success: true, message: "User was already deleted" });
        }
        return json({ error: "Failed to delete user", details: authDeleteError.message }, 500);
      }

      return json({ success: true, message: "User deleted successfully" });
    }

    // ==================== INVITE USER ====================
    if (action === "invite") {
      const { email, chapter_id, role = "user" } = body;

      if (!email || !chapter_id) {
        return json({ error: "Email and chapter are required" }, 400);
      }

      if (!["admin", "user"].includes(role)) {
        return json({ error: "Role must be admin or user" }, 400);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existingUser) {
        const { data: existingSettings } = await adminClient
          .from("user_settings")
          .select("chapter_id, role")
          .eq("user_id", existingUser.id)
          .single();

        if (existingSettings?.chapter_id) {
          return json({
            error: `A user with email ${email} already exists and is assigned to a chapter. Use User Management to change their chapter or role.`,
          }, 409);
        }

        const { error: updateError } = await adminClient
          .from("user_settings")
          .update({ chapter_id, role })
          .eq("user_id", existingUser.id);

        if (updateError) {
          return json({ error: "Failed to update user assignment", details: updateError.message }, 500);
        }

        return json({
          success: true,
          message: `${email} already had an account. Updated their chapter and role.`,
          user_id: existingUser.id,
          already_existed: true,
        });
      }

      // Check for existing pending invite
      const { data: existingInvite } = await adminClient
        .from("pending_invites")
        .select("id")
        .eq("email", normalizedEmail)
        .single();

      // Store pending invite
      const { error: inviteStoreError } = await adminClient
        .from("pending_invites")
        .upsert(
          { email: normalizedEmail, chapter_id, role, invited_by: caller.id },
          { onConflict: "email" }
        );

      if (inviteStoreError) {
        return json({ error: "Failed to store invite", details: inviteStoreError.message }, 500);
      }

      // Send invite email
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin
        .inviteUserByEmail(normalizedEmail);

      if (inviteError) {
        await adminClient
          .from("pending_invites")
          .delete()
          .eq("email", normalizedEmail);

        const msg = inviteError.message?.toLowerCase() || "";
        if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
          return json({
            error: `A user with email ${email} has already been invited or registered. Check User Management.`,
          }, 409);
        }
        if (msg.includes("rate") || msg.includes("limit")) {
          return json({
            error: "Email rate limit reached. Supabase free tier allows 2 invite emails per hour. Please wait and try again.",
          }, 429);
        }

        return json({ error: "Failed to send invite email", details: inviteError.message }, 500);
      }

      return json({
        success: true,
        message: existingInvite
          ? `Re-sent invite to ${email} (previous invite was updated)`
          : `Invite sent to ${email}`,
        user_id: inviteData.user?.id,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    return json({ error: "Internal server error", details: String(err) }, 500);
  }
});
