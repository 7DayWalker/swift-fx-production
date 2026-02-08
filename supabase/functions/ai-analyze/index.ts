// Supabase Edge Function: AI Chart Analyzer
// Deno-native implementation using OpenAI-compatible API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tier-based usage limits
const USAGE_LIMITS: Record<string, number> = {
  free: 3,
  premium: 10,
  vip: -1,    // unlimited
  admin: -1,  // unlimited
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
  ai_weekly_used: number;
  ai_weekly_reset: string | null;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Extract auth token from request header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    // Create client with user's JWT token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Service client for admin operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 2. Verify user authentication by getting user from token
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id, user.email);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, ai_weekly_used, ai_weekly_reset")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile fetch error:", profileError);
      return new Response(
        JSON.stringify({ error: "Could not fetch user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedProfile = profile as ProfileData;
    const userRole = typedProfile.role || "free";
    let aiWeeklyUsed = typedProfile.ai_weekly_used || 0;
    let aiWeeklyReset = typedProfile.ai_weekly_reset ? new Date(typedProfile.ai_weekly_reset) : null;

    // 5. Check if weekly reset is needed
    const now = new Date();
    if (!aiWeeklyReset || (now.getTime() - aiWeeklyReset.getTime()) >= WEEK_MS) {
      // Reset the counter
      aiWeeklyUsed = 0;
      aiWeeklyReset = now;
      
      const { error: resetError } = await supabaseAdmin
        .from("profiles")
        .update({
          ai_weekly_used: 0,
          ai_weekly_reset: now.toISOString(),
        })
        .eq("id", user.id);

      if (resetError) {
        console.error("Failed to reset weekly usage:", resetError);
      }
    }

    // 6. Check usage limits
    const limit = USAGE_LIMITS[userRole] ?? USAGE_LIMITS.free;
    const isUnlimited = limit === -1;
    const remaining = isUnlimited ? 999 : Math.max(0, limit - aiWeeklyUsed);

    if (!isUnlimited && remaining <= 0) {
      return new Response(
        JSON.stringify({
          error: "Weekly AI analysis limit reached",
          limit,
          used: aiWeeklyUsed,
          remaining: 0,
          resets_at: aiWeeklyReset ? new Date(aiWeeklyReset.getTime() + WEEK_MS).toISOString() : null,
          upgrade_message: userRole === "free" 
            ? "Upgrade to Premium for 10 analyses/week or VIP for unlimited."
            : "Upgrade to VIP for unlimited analyses.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Parse request body
    const body: AnalyzeRequest = await req.json();
    const { prompt, pair = "Unknown", timeframe = "Unknown", image_base64 } = body;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Call OpenAI-compatible API (using Emergent LLM Key)
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build messages array for the API call
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

    // Build messages - optionally include image if provided
    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (image_base64) {
      // Vision API call with image
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
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiResponseText = openaiData.choices?.[0]?.message?.content || "";
    const tokensUsed = openaiData.usage?.total_tokens || 0;

    // 9. Parse AI response (extract JSON from response)
    let analysisResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback: create structured response from raw text
      analysisResult = {
        market_bias: "Unknown",
        trend_structure: aiResponseText,
        support_levels: [],
        resistance_levels: [],
        trade_insight: "Unable to generate structured analysis",
        confidence: "Low",
      };
    }

    // 10. Increment usage counter
    const newUsage = aiWeeklyUsed + 1;
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ ai_weekly_used: newUsage })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update usage counter:", updateError);
    }

    // 11. Insert analysis record
    const analysisRecord = {
      user_id: user.id,
      prompt: prompt.substring(0, 2000), // Limit prompt storage
      response: JSON.stringify(analysisResult),
      model: "gpt-4o-mini",
      tokens_used: tokensUsed,
    };

    const { data: insertedAnalysis, error: insertError } = await supabaseAdmin
      .from("ai_analyses")
      .insert(analysisRecord)
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("Failed to insert analysis record:", insertError);
    }

    // 12. Calculate new remaining
    const newRemaining = isUnlimited ? 999 : Math.max(0, limit - newUsage);

    // 13. Return successful response
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
        created_at: insertedAnalysis?.created_at || new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
