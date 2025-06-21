import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, details, recaptchaToken } = await req.json();

    if (!details) {
      return new Response(JSON.stringify({ error: "Feature details are required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 1. Verify reCAPTCHA token
    const recaptchaSecretKey = Deno.env.get("RECAPTCHA_SECRET_KEY");
    if (!recaptchaSecretKey) {
      console.error("RECAPTCHA_SECRET_KEY is not set in Supabase secrets.");
      return new Response(JSON.stringify({ error: "Server configuration error: reCAPTCHA key missing." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const recaptchaVerificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecretKey}&response=${recaptchaToken}`;
    const recaptchaResponse = await fetch(recaptchaVerificationUrl, { method: "POST" });
    const recaptchaData = await recaptchaResponse.json();

    if (!recaptchaData.success || recaptchaData.score < 0.5) { // Adjust score threshold as needed
      console.warn("reCAPTCHA verification failed:", recaptchaData);
      return new Response(JSON.stringify({ error: "reCAPTCHA verification failed. Please try again." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // 2. Insert into Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const { error: dbError } = await supabase
      .from("feature_requests")
      .insert({ name, email, details });

    if (dbError) {
      console.error("Supabase insert error:", dbError);
      return new Response(JSON.stringify({ error: dbError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("Feature request submitted successfully.");
    return new Response(JSON.stringify({ message: "Feature request submitted successfully!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function error in submit-feature-request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});