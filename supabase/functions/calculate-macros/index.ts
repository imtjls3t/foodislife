import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const nutritionFields = {
  type: "object",
  additionalProperties: false,
  required: [
    "calories",
    "carbs_g",
    "protein_g",
    "fiber_g",
    "fat_g",
    "pufa_g",
    "mufa_g",
    "saturated_fat_g",
  ],
  properties: {
    calories: { type: "number" },
    carbs_g: { type: "number" },
    protein_g: { type: "number" },
    fiber_g: { type: "number" },
    fat_g: { type: "number" },
    pufa_g: { type: "number" },
    mufa_g: { type: "number" },
    saturated_fat_g: { type: "number" },
  },
};

const macroSchema = {
  type: "object",
  additionalProperties: false,
  required: ["per_serving", "total", "notes"],
  properties: {
    per_serving: nutritionFields,
    total: nutritionFields,
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const auth = await getAuthedUser(authHeader);
  if ("error" in auth) return json({ error: auth.error }, auth.status);

  const premium = await requirePremium(auth.user.id);
  if ("error" in premium) return json({ error: premium.error }, premium.status);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OpenAI API key not configured" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const recipe = body.recipe;
  if (!recipe?.ingredients?.length) return json({ error: "Recipe ingredients are required" }, 400);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini",
      reasoning: { effort: "low" },
      input: [
        {
          role: "developer",
          content: [
            "Estimate recipe nutrition from ingredients and base servings.",
            "Return calories as kcal and every macro as grams.",
            "The ingredient quantities are for the whole recipe at base_servings.",
            "total is the whole recipe. per_serving is total divided by base_servings.",
            "Include carbs, protein, fiber, total fat, PUFA, MUFA, and saturated fat.",
            "Use reasonable nutrition knowledge and density estimates when exact data is unavailable.",
            "Do not include extra keys.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            title: recipe.title,
            base_servings: recipe.base_servings || 1,
            ingredients: recipe.ingredients,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "macro_estimate",
          schema: macroSchema,
          strict: true,
        },
      },
    }),
  });

  const resultText = await response.text();
  if (!response.ok) return json({ error: `OpenAI error: ${resultText}` }, 502);

  let result;
  try {
    result = JSON.parse(resultText);
  } catch {
    return json({ error: "OpenAI returned invalid JSON envelope" }, 502);
  }

  const outputText = extractOutputText(result);
  if (!outputText) return json({ error: "OpenAI returned no macro output" }, 502);

  try {
    const estimate = JSON.parse(outputText);
    return json({
      macro_estimate: {
        ...estimate,
        calculated_at: new Date().toISOString(),
        base_servings: recipe.base_servings || 1,
        is_estimate: true,
        stale: false,
      },
    });
  } catch {
    return json({ error: "OpenAI returned invalid macro JSON" }, 502);
  }
});

async function getAuthedUser(authHeader: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  return { user };
}

async function requirePremium(userId: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await adminClient
    .from("profiles")
    .select("is_premium")
    .eq("id", userId)
    .single();

  if (error) return { error: "Unable to check premium status", status: 500 };
  if (!data?.is_premium) return { error: "Macro calculation requires premium access", status: 403 };
  return { ok: true };
}

function extractOutputText(result: any) {
  if (typeof result.output_text === "string") return result.output_text;
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
