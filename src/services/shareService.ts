import type { TripPlan } from '../types';

export interface ShareOptions { includeInsiderSecrets?: boolean; recipientNote?: string }
export function generateShareableSummary(trip: TripPlan, note?: string): string {
  const lines = [`${trip.city} · Turnside itinerary`, trip.summary, ...(note ? [note] : []), ''];
  trip.days.forEach((day) => {
    lines.push(`Day ${day.dayNumber}: ${day.title} · ${day.date}`);
    day.stops.filter((stop) => stop.status !== 'skipped').forEach((stop) => {
      lines.push(`${stop.time} — ${stop.title}`, `${stop.address} · ${stop.durationMinutes} min`);
      if (stop.bookingPass?.status === 'handoff') lines.push('Booking: complete directly with the venue; not confirmed.');
      const link = (stop as any).sourceUrl; if (link) lines.push(link);
      lines.push('');
    });
  });
  lines.push('Planned with Turnside. Check venue hours and availability before visiting.');
  return lines.join('\n');
}
export function getWhatsAppShareUrl(text: string): string { return `https://wa.me/?text=${encodeURIComponent(text)}`; }
export function getEmailShareUrl(subject: string, body: string): string { return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
export function getTwitterShareUrl(text: string): string { const shortened = text.length > 260 ? `${text.slice(0, 257)}…` : text; return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shortened)}`; }
export async function shareTrip(trip: TripPlan): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = generateShareableSummary(trip);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ title: `${trip.city} · Turnside`, text }); return 'shared'; }
    catch (error: any) { if (error?.name === 'AbortError') return 'cancelled'; }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return 'copied'; }
  throw new Error('Sharing is unavailable in this browser. Select and copy the itinerary text.');
}
