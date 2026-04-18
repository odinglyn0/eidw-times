import { next } from "@vercel/edge";

const AI_BOTS = [
  "chatgpt",
  "openai",
  "gpt",
  "oai-searchBot",
  "claude",
  "anthropic",
  "perplexity",
  "agi",
  "devin",
  "duckassist",
  "applebot",
  "cloudflare-ai-search",
  "bravebot",
  "anomura",
  "googleother"
];

const SEARCH_BOTS = [
  "googlebot",
  "bingbot",
  "msnbot",
  "duckduck",
  "yandexbot",
  "baidu",
  "facebook",
  "amazon",
  "meta-externalagent",
  "byte",
];

const DATAGRAM = "https://datagram.eidwtimes.xyz";

export default function middleware(request: Request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();

  if (AI_BOTS.some((bot) => ua.includes(bot))) {
    return Response.redirect(`${DATAGRAM}/llms.txt`, 301);
  }

  if (SEARCH_BOTS.some((bot) => ua.includes(bot))) {
    return Response.redirect(`${DATAGRAM}/api/seo-security-data`, 302);
  }

  return next();
}

export const config = {
  matcher: "/((?!_next/|assets/|images/|favicon|manifest\\.json|intakeLogo).*)",
};
