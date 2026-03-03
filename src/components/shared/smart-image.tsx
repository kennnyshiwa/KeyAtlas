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

const TRUSTED_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "lh3.googleusercontent.com",
  "picsum.photos",
  "fastly.picsum.photos",
  "i.imgur.com",
  "imgur.com",
  "i.redd.it",
  "preview.redd.it",
  "pbs.twimg.com",
  "i.postimg.cc",
  "images.unsplash.com",
  "cdn.shopify.com",
  "geekhack.org",
  "photos.kstj.us",
  "i.ibb.co",
  "bord.design",
]);

const DIRECT_LOAD_HOSTS = new Set([
  // Next image optimizer occasionally crashes on timeout for this host in prod.
  "i.postimg.cc",
]);

function getImageMode(src: string): "next" | "direct" {
  if (!src) return "direct";
  if (src.startsWith("/")) return "next";

  try {
    const u = new URL(src);
    if (DIRECT_LOAD_HOSTS.has(u.hostname)) return "direct";
    return TRUSTED_HOSTS.has(u.hostname) ? "next" : "direct";
  } catch {
    return "direct";
  }
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
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={loading} width={width} height={height} />;
}
