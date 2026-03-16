import Image from "next/image";

type SmartImageProps = {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  loading?: "lazy" | "eager";
  priority?: boolean;
  quality?: number;
};

function getImageMode(src: string): "next" | "direct" {
  if (!src) return "direct";
  // Serve uploaded images directly — they're already stored locally
  if (src.startsWith("/uploads/")) return "direct";
  // All other URLs (https://) go through Next.js Image optimizer
  return "next";
}

export function SmartImage({ src, alt, className, fill, width, height, sizes, loading = "lazy", priority = false, quality }: SmartImageProps) {
  const mode = getImageMode(src);

  if (mode === "next") {
    if (fill) {
      return <Image src={src} alt={alt} fill className={className} sizes={sizes} priority={priority} quality={quality} />;
    }
    return (
      <Image
        src={src}
        alt={alt}
        width={width || 1200}
        height={height || 800}
        className={className}
        sizes={sizes}
        priority={priority}
        quality={quality}
      />
    );
  }

  if (fill) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={loading} width={width} height={height} />;
}
