// Supabase Edge Function: AI Chart Analyzer
// Deno-native implementation using OpenAI-compatible API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://swiftfx.online,https://www.swiftfx.online")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin =
    !origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".swiftfx.online") || origin.endsWith(".e2b.app")
      ? origin || ALLOWED_ORIGINS[0] || "https://swiftfx.online"
      : ALLOWED_ORIGINS[0] || "https://swiftfx.online";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Tier-based usage limits
const USAGE_LIMITS: Record<string, number> = {
  free: 3,
  premium: 10,
  vip: -1,         // unlimited
  admin: -1,       // unlimited
  super_admin: -1, // unlimited
};

// 7 days in milliseconds
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface AnalyzeRequest {
  prompt: string;
  pair?: string;
  timeframe?: string;
  image_base64?: string;
}

interface ProfileData {
  id: string;
  role: string;
  subscription?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expiry?: string | null;
  ai_weekly_used: number;
  ai_weekly_reset: string | null;
}

function resolveEffectiveTier(profile: ProfileData, now: Date): string {
  const role = (profile.role || "free").toLowerCase();
  if (role === "super_admin" || role === "admin") {
    return role;
  }

  const subCandidate = (profile.subscription_tier || profile.subscription || "").toLowerCase();
  const subStatus = (profile.subscription_status || "active").toLowerCase();
  const expiryOk = !profile.subscription_expiry || new Date(profile.subscription_expiry).getTime() > now.getTime();

  if ((subCandidate === "vip" || subCandidate === "premium") && expiryOk && ["active", "grace_period", "trialing"].includes(subStatus)) {
    return subCandidate;
  }

  if (role === "vip" || role === "premium") {
    return role;
  }
  return "free";
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, subscription, subscription_tier, subscription_status, subscription_expiry, ai_weekly_used, ai_weekly_reset")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Could not fetch user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedProfile = profile as ProfileData;
    const now = new Date();
    const effectiveTier = resolveEffectiveTier(typedProfile, now);
    let aiWeeklyUsed = typedProfile.ai_weekly_used || 0;
    let aiWeeklyReset = typedProfile.ai_weekly_reset ? new Date(typedProfile.ai_weekly_reset) : null;

    // Reset weekly counter if expired (ai_weekly_reset stores either window start or next reset date)
    const needsReset = !aiWeeklyReset || now.getTime() >= aiWeeklyReset.getTime();
    if (needsReset) {
      const nextReset = new Date(now.getTime() + WEEK_MS);
      aiWeeklyUsed = 0;
      aiWeeklyReset = nextReset;

      await supabaseAdmin
        .from("profiles")
        .update({
          ai_weekly_used: 0,
          ai_weekly_reset: nextReset.toISOString(),
        })
        .eq("id", user.id);
    }

    const limit = USAGE_LIMITS[effectiveTier] ?? USAGE_LIMITS.free;
    const isUnlimited = limit === -1;
    const remaining = isUnlimited ? 999 : Math.max(0, limit - aiWeeklyUsed);

    if (!isUnlimited && remaining <= 0) {
      return new Response(
        JSON.stringify({
          error: "Weekly AI analysis limit reached",
          limit,
          used: aiWeeklyUsed,
          remaining: 0,
          resets_at: aiWeeklyReset ? aiWeeklyReset.toISOString() : null,
          upgrade_message: effectiveTier === "free"
            ? "Upgrade to Premium for 10 analyses/week or VIP for unlimited."
            : "Upgrade to VIP for unlimited analyses.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: AnalyzeRequest = await req.json();
    const { prompt, pair = "Unknown", timeframe = "Unknown", image_base64 } = body;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (image_base64 && image_base64.length > 7_000_000) {
      return new Response(
        JSON.stringify({ error: "Image payload exceeds 5MB limit" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reserve usage slot optimistically before calling upstream LLM to prevent parallel race bypass
    let reservedUsage = aiWeeklyUsed + 1;
    if (!isUnlimited) {
      const { data: reservedRows, error: reserveErr } = await supabaseAdmin
        .from("profiles")
        .update({ ai_weekly_used: reservedUsage })
        .eq("id", user.id)
        .eq("ai_weekly_used", aiWeeklyUsed)
        .select("ai_weekly_used");

      if (reserveErr || !reservedRows || reservedRows.length === 0) {
        return new Response(
          JSON.stringify({ error: "Concurrent AI analysis request detected. Please retry." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
    if (!openaiApiKey) {
      if (!isUnlimited) {
        await supabaseAdmin.from("profiles").update({ ai_weekly_used: aiWeeklyUsed }).eq("id", user.id);
      }
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert forex and crypto trading chart analyst. Analyze the provided chart or description and provide:
1. Market Bias (Bullish, Bearish, or Neutral)
2. Trend Structure (describe the current trend, key patterns)
3. Support Levels (list 2-3 key support levels if identifiable)
4. Resistance Levels (list 2-3 key resistance levels if identifiable)
5. Trade Insight (actionable trading insight based on analysis)
6. Confidence (High, Medium, or Low)

Respond in JSON format:
{
  "market_bias": "Bullish|Bearish|Neutral",
  "trend_structure": "description of trend and patterns",
  "support_levels": ["level1", "level2"],
  "resistance_levels": ["level1", "level2"],
  "trade_insight": "actionable insight",
  "confidence": "High|Medium|Low"
}`;

    const userPrompt = `Analyze this ${pair} chart on ${timeframe} timeframe:\n\n${prompt}`;
    const messages: unknown[] = [{ role: "system", content: systemPrompt }];

    if (image_base64) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${image_base64}`,
              detail: "high",
            },
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      if (!isUnlimited) {
        await supabaseAdmin.from("profiles").update({ ai_weekly_used: aiWeeklyUsed }).eq("id", user.id);
      }
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiResponseText = openaiData.choices?.[0]?.message?.content || "";
    const tokensUsed = openaiData.usage?.total_tokens || 0;

    let analysisResult;
    try {
      const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      analysisResult = {
        market_bias: "Unknown",
        trend_structure: aiResponseText,
        support_levels: [],
        resistance_levels: [],
        trade_insight: "Unable to generate structured analysis",
        confidence: "Low",
      };
    }

    const analysisRecord = {
      user_id: user.id,
      prompt: prompt.substring(0, 2000),
      response: JSON.stringify(analysisResult),
      model: "gpt-4o-mini",
      tokens_used: tokensUsed,
    };

    const { data: insertedAnalysis } = await supabaseAdmin
      .from("ai_analyses")
      .insert(analysisRecord)
      .select("id, created_at")
      .single();

    const newRemaining = isUnlimited ? 999 : Math.max(0, limit - reservedUsage);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: insertedAnalysis?.id || null,
        pair,
        timeframe,
        market_bias: analysisResult.market_bias,
        trend_structure: analysisResult.trend_structure,
        support_levels: analysisResult.support_levels || [],
        resistance_levels: analysisResult.resistance_levels || [],
        trade_insight: analysisResult.trade_insight,
        confidence: analysisResult.confidence,
        remaining_analyses: newRemaining,
        weekly_limit: isUnlimited ? "unlimited" : limit,
        disclaimer: "This analysis is AI-generated and for educational purposes only. Always do your own research and risk management before trading.",
        created_at: insertedAnalysis?.created_at || now.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
