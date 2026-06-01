import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedToken = Deno.env.get("KEEPALIVE_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!expectedToken || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing keepalive configuration");
    return json({ error: "Keepalive is not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await adminClient
    .from("profiles")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Keepalive query failed", error.message);
    return json({ error: "Keepalive query failed" }, 500);
  }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    rowsSeen: data?.length ?? 0,
  });
});
