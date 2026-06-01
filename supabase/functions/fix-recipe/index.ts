import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "base_servings", "ingredients", "steps"],
  properties: {
    title: { type: "string" },
    base_servings: { type: "number" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "amount", "unit", "grams", "note", "original_text", "estimated_density"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          amount: { type: ["number", "null"] },
          unit: { type: "string" },
          grams: { type: ["number", "null"] },
          note: { type: "string" },
          original_text: { type: "string" },
          estimated_density: { type: "boolean" },
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "ingredient_refs", "timers"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          ingredient_refs: {
            type: "array",
            items: { type: "string" },
          },
          timers: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "label", "seconds"],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                seconds: { type: "number" },
              },
            },
          },
        },
      },
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

  const sourceText = String(body.sourceText || "").trim();
  if (!sourceText) return json({ error: "sourceText is required" }, 400);
  if (sourceText.length > 60000) return json({ error: "Recipe text is too long" }, 400);

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
            "Extract and normalize the pasted recipe without creative rewriting.",
            "Use grams for mass ingredients.",
            "Use tsp, tbsp, or cup for common kitchen volumes; otherwise use ml.",
            "For volume ingredients, also provide grams when reasonably inferable. Set estimated_density true when that gram value is density-estimated.",
            "Use ingredient ids like ing_1, ing_2. Use step ids like step_1 and timer ids like timer_1_1.",
            "For procedure steps, keep concise natural instructions. If a step mentions an ingredient, include its ingredient id in ingredient_refs and omit repeated quantities from the text; the app will insert bold scaled amounts.",
            "For timers, extract explicit cooking/waiting durations in seconds. If a range is given, use the larger value.",
            "If servings are missing, use 1.",
          ].join(" "),
        },
        {
          role: "user",
          content: sourceText,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "recipe",
          schema: recipeSchema,
          strict: true,
        },
      },
    }),
  });

  const resultText = await response.text();
  if (!response.ok) {
    return json({ error: `OpenAI error: ${resultText}` }, 502);
  }

  let result;
  try {
    result = JSON.parse(resultText);
  } catch {
    return json({ error: "OpenAI returned invalid JSON envelope" }, 502);
  }

  const outputText = extractOutputText(result);
  if (!outputText) return json({ error: "OpenAI returned no recipe output" }, 502);

  try {
    return json({ recipe: JSON.parse(outputText) });
  } catch {
    return json({ error: "OpenAI returned invalid recipe JSON" }, 502);
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
  if (!data?.is_premium) return { error: "Recipe fixer requires premium access", status: 403 };
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
