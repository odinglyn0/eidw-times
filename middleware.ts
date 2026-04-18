import { next } from "@vercel/edge";

const AI_BOTS = [
  "chatgpt-user",
  "gptbot",
  "oai-searchbot",
  "claude-web",
  "claudebot",
  "anthropic-ai",
  "perplexity",
  "perplexitybot",
];

const SEARCH_BOTS = [
  "google-extended",
  "googlebot",
  "bingbot",
  "msnbot",
  "duckduckbot",
  "duckassistbot",
  "yandexbot",
  "baiduspider",
  "facebot",
  "facebookbot",
  "applebot",
  "amazonbot",
  "meta-externalagent",
  "bytespider",
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
