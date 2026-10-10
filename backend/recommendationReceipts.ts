import type { Recommendation } from "../src/recommendationTypes";

const TTL_MS = 20 * 60 * 1000;
const MAX_TOKEN = 120000;
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid receipt.");
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function cityName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
const receiptError = () =>
  new Error(
    "These place selections expired or could not be verified. Search again before planning.",
  );

/** Client-held, transient provider data. A receipt expires in 20 minutes and is
 * never stored by the hosted API. The HMAC protects identities and coordinates.
 */
export function createRecommendationReceipts(secret?: string, now = Date.now) {
  const configured = typeof secret === "string" && secret.length >= 32;
  let key: Promise<CryptoKey> | undefined;
  const signingKey = () =>
    (key ||= crypto.subtle.importKey(
      "raw",
      encoder.encode(secret!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    ));
  return {
    configured,
    async issue(
      city: string,
      recommendations: Recommendation[],
    ): Promise<string | undefined> {
      if (!configured || !recommendations.length) return undefined;
      const payload = encode(
        encoder.encode(
          JSON.stringify({
            v: 1,
            expiresAt: now() + TTL_MS,
            city,
            recommendations,
          }),
        ),
      );
      if (payload.length + 44 > MAX_TOKEN) return undefined;
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          await signingKey(),
          encoder.encode(payload),
        ),
      );
      return `${payload}.${encode(signature)}`;
    },
    async resolve(
      token: unknown,
      ids: string[],
      city: string,
    ): Promise<Recommendation[]> {
      try {
        if (
          !configured ||
          typeof token !== "string" ||
          token.length > MAX_TOKEN
        )
          throw receiptError();
        const parts = token.split(".");
        if (parts.length !== 2) throw receiptError();
        const signature = decode(parts[1]);
        if (
          signature.length !== 32 ||
          !(await crypto.subtle.verify(
            "HMAC",
            await signingKey(),
            signature,
            encoder.encode(parts[0]),
          ))
        )
          throw receiptError();
        const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
        if (
          payload.v !== 1 ||
          !Number.isFinite(payload.expiresAt) ||
          payload.expiresAt <= now() ||
          payload.expiresAt > now() + TTL_MS + 60000 ||
          typeof payload.city !== "string" ||
          cityName(payload.city) !== cityName(city) ||
          !Array.isArray(payload.recommendations) ||
          payload.recommendations.length > 18 ||
          !ids.length ||
          ids.length > 18 ||
          new Set(ids).size !== ids.length
        )
          throw receiptError();
        return ids.map((id) => {
          const place = payload.recommendations.find((p: any) => p?.id === id);
          if (
            !place ||
            typeof place.title !== "string" ||
            typeof place.city !== "string" ||
            cityName(place.city) !== cityName(payload.city) ||
            ![
              "editorial-demo",
              "google-maps-grounding",
              "google-places",
            ].includes(place.source)
          )
            throw receiptError();
          if (
            !Array.isArray(place.coordinates) ||
            place.coordinates.length !== 2 ||
            !place.coordinates.every(Number.isFinite) ||
            Math.abs(place.coordinates[0]) > 180 ||
            Math.abs(place.coordinates[1]) > 90
          )
            throw new Error(
              "Resolve this recommendation with Google Places before adding it to a plan.",
            );
          return place as Recommendation;
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Resolve this recommendation")
        )
          throw error;
        throw receiptError();
      }
    },
  };
}
