/** Inline cup-and-steam mark — replaces the emoji logo so the brand renders
 *  identically on every platform and inherits currentColor. */
export default function BrewMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 10h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5Z" />
      <path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M8 2.5c-.8 1.2-.8 2.3 0 3.5M12 2.5c-.8 1.2-.8 2.3 0 3.5" />
    </svg>
  );
}
