import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

export type CarouselSlide = {
  src: string;
  alt: string;
  title: string;
  caption: string;
};

type Props = {
  slides: CarouselSlide[];
  className?: string;
  autoPlayMs?: number;
  tone?: "light" | "dark";
};

export default function ImageCarousel({
  slides,
  className = "",
  autoPlayMs = 5200,
  tone = "light"
}: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", skipSnaps: false });
  const [index, setIndex] = useState(0);
  const dark = tone === "dark";

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || slides.length < 2) return undefined;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      emblaApi.scrollNext();
    }, autoPlayMs);
    return () => window.clearInterval(id);
  }, [emblaApi, autoPlayMs, slides.length]);

  const active = slides[index] || slides[0];

  return (
    <div className={className}>
      <div
        className={`overflow-hidden rounded-2xl border shadow-soft ${
          dark ? "border-white/15 bg-white/5" : "border-line bg-surface"
        }`}
        ref={emblaRef}
      >
        <div className="flex">
          {slides.map((slide) => (
            <div key={slide.src} className="min-w-0 flex-[0_0_100%]">
              <div className={`relative aspect-[4/3] overflow-hidden ${dark ? "bg-white/10" : "bg-mist"}`}>
                <img
                  src={slide.src}
                  alt={slide.alt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/55 to-transparent" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <motion.p
            key={active?.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={`font-display text-lg font-semibold tracking-tight ${dark ? "text-white" : "text-ink"}`}
          >
            {active?.title}
          </motion.p>
          <motion.p
            key={active?.caption}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={`mt-1.5 text-sm leading-relaxed ${dark ? "text-white/70" : "text-ink/65"}`}
          >
            {active?.caption}
          </motion.p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => emblaApi?.scrollPrev()}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
              dark
                ? "border-white/20 bg-white/5 text-white hover:bg-white/12"
                : "border-line bg-surface text-ink hover:bg-mist"
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => emblaApi?.scrollNext()}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
              dark
                ? "border-white/20 bg-white/5 text-white hover:bg-white/12"
                : "border-line bg-surface text-ink hover:bg-mist"
            }`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2" role="tablist" aria-label="Carousel slides">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index
                ? dark
                  ? "w-8 bg-white"
                  : "w-8 bg-navy"
                : dark
                  ? "w-2.5 bg-white/30 hover:bg-white/50"
                  : "w-2.5 bg-line hover:bg-ink/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
