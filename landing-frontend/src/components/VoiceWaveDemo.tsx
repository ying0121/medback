const BARS = 40;

export default function VoiceWaveDemo() {
  return (
    <div className="flex h-16 items-end justify-center gap-[3px] px-4">
      {Array.from({ length: BARS }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-gradient-to-t from-indigo to-teal"
          style={{
            height: `${28 + (i % 7) * 8}%`,
            animation: `waveBar 1.1s ease-in-out ${(i * 0.04).toFixed(2)}s infinite`
          }}
        />
      ))}
    </div>
  );
}
