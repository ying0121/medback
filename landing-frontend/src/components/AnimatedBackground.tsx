export default function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 hero-glow" />
      <div className="absolute -left-32 top-20 h-96 w-96 animate-float rounded-full bg-teal/20 blur-3xl" />
      <div className="absolute -right-24 top-40 h-[28rem] w-[28rem] animate-float-delayed rounded-full bg-indigo/15 blur-3xl" />
      <div className="absolute bottom-0 left-1/2 h-64 w-[120%] -translate-x-1/2 bg-gradient-to-t from-[#f4f7fc] to-transparent" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-indigo" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}
