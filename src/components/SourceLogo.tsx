export function SourceLogo({
  provider,
  small = false,
}: {
  provider: string;
  small?: boolean;
}) {
  return (
    <span
      className={`source-logo source-${provider} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {provider === "google" ? (
        <svg viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.7Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 5-.9 6.8-2.5l-3.3-2.6c-.9.6-2.1 1-3.5 1-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7A5.9 5.9 0 0 1 12 6.1Z"
          />
        </svg>
      ) : provider === "gemini" ? (
        <svg viewBox="0 0 24 24">
          <defs>
            <linearGradient id="gemini-source" x2="1" y2="1">
              <stop stopColor="#4285f4" />
              <stop offset=".5" stopColor="#9b72cb" />
              <stop offset="1" stopColor="#d96570" />
            </linearGradient>
          </defs>
          <path
            fill="url(#gemini-source)"
            d="M12 1c1.1 6.2 4.8 9.9 11 11-6.2 1.1-9.9 4.8-11 11C10.9 16.8 7.2 13.1 1 12 7.2 10.9 10.9 7.2 12 1Z"
          />
        </svg>
      ) : provider.startsWith("nyc") ? (
        <span className="nyc-lettermark">NYC</span>
      ) : provider === "openstreetmap" ? (
        <svg viewBox="0 0 24 24">
          <path d="m2 6 6-3 8 3 6-3v15l-6 3-8-3-6 3Z" fill="#bdd8a3" />
          <path d="M8 3v15m8-12v15" stroke="#fff" strokeWidth="1.5" />
          <circle
            cx="13"
            cy="10"
            r="5"
            fill="#e5f0fb"
            stroke="#78a5c4"
            strokeWidth="1.6"
          />
          <path d="m17 14 4 5" stroke="#6891ae" strokeWidth="2.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="m5 11 15-7-7 16-2-7Z" fill="#007aff" />
        </svg>
      )}
    </span>
  );
}
