"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/shared/image-upload";
import { GalleryStudio } from "@/components/projects/gallery-studio";
import { VendorMultiSelect } from "@/components/projects/vendor-multi-select";
import { ProjectOwnershipTransfer } from "@/components/projects/project-ownership-transfer";
import { CATEGORY_LABELS, STATUS_LABELS, PROFILE_OPTIONS } from "@/lib/constants";
import { generateSlug } from "@/lib/utils";
import type { ProjectFormData } from "@/lib/validations/project";
import type { ProjectWithRelations } from "@/types";
import { Plus, Trash2, Loader2, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import type { GeekhackPrefillPayload } from "@/lib/import/geekhack";

const RichTextEditor = lazy(() =>
  import("@/components/editor/rich-text-editor").then((m) => ({
    default: m.RichTextEditor,
  }))
);

interface ProjectFormProps {
  project?: ProjectWithRelations & {
    projectVendors?: {
      vendorId: string;
      region: string | null;
      storeLink: string | null;
      endDate: Date | null;
    }[];
  };
  vendors?: { id: string; name: string; regionsServed?: string[]; storefrontUrl?: string | null }[];
  mode?: "admin" | "submit";
  showSectionNav?: boolean;
}

function PriceInput({ id, valueCents, onValueCents }: { id: string; valueCents: number | null | undefined; onValueCents: (v: number | null) => void }) {
  const [display, setDisplay] = useState(valueCents != null ? (valueCents / 100).toString() : "");
  const initialized = useRef(false);

  // Sync from parent only on mount or when valueCents changes externally
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    // Only sync if the input isn't focused (external change)
    if (document.activeElement?.id !== id) {
      setDisplay(valueCents != null ? (valueCents / 100).toString() : "");
    }
  }, [valueCents, id]);

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow empty, digits, one decimal point
        if (raw !== "" && !/^\d*\.?\d{0,2}$/.test(raw)) return;
        setDisplay(raw);
        if (raw === "" || raw === ".") {
          onValueCents(null);
        } else {
          onValueCents(Math.round(Number(raw) * 100));
        }
      }}
      onBlur={() => {
        // Format nicely on blur
        if (valueCents != null) {
          setDisplay((valueCents / 100).toFixed(2));
        } else {
          setDisplay("");
        }
      }}
    />
  );
}

export function ProjectForm({ project, vendors = [], mode = "admin", showSectionNav: showSectionNavProp }: ProjectFormProps) {
  const router = useRouter();
  const isEditing = !!project;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  const [profileOptions, setProfileOptions] = useState<string[]>(
    [...PROFILE_OPTIONS].sort((a, b) => a.localeCompare(b))
  );

  const [formData, setFormData] = useState<ProjectFormData>({
    title: project?.title ?? "",
    slug: project?.slug ?? "",
    description: project?.description ?? "",
    category: project?.category ?? "KEYCAPS",
    status: project?.status ?? "INTEREST_CHECK",
    priceMin: project?.priceMin ?? null,
    priceMax: project?.priceMax ?? null,
    currency: project?.currency ?? "USD",
    heroImage: project?.heroImage ?? null,
    descriptionTextAlign: project?.descriptionTextAlign ?? "LEFT",
    descriptionFontScale: project?.descriptionFontScale ?? "MEDIUM",
    descriptionTextColor: project?.descriptionTextColor ?? null,
    descriptionMaxWidth: "FULL",
    tags: project?.tags ?? [],
    icDate: project?.icDate ?? null,
    gbStartDate: project?.gbStartDate ?? null,
    gbEndDate: project?.gbEndDate ?? null,
    estimatedDelivery: project?.estimatedDelivery ?? "",
    profile: project?.profile ?? null,
    shipped: project?.shipped ?? false,
    designer: project?.designer ?? "",
    vendorId: project?.vendorId ?? null,
    featured: project?.featured ?? false,
    published: project?.published ?? false,
    metaTitle: project?.metaTitle ?? null,
    metaDescription: project?.metaDescription ?? null,
    images: project?.images?.map((img) => ({
      url: img.url,
      alt: img.alt ?? undefined,
      order: img.order,
      linkUrl: img.linkUrl ?? null,
      openInNewTab: img.openInNewTab ?? true,
    })) ?? [],
    projectVendors: project?.projectVendors?.map((pv) => ({
      vendorId: pv.vendorId,
      region: pv.region ?? "",
      storeLink: pv.storeLink ?? "",
      endDate: pv.endDate ?? null,
    })) ?? [],
    links: project?.links?.map((link) => ({
      label: link.label,
      url: link.url,
      type: link.type,
    })) ?? [],
  });

  const [tagInput, setTagInput] = useState("");
  const [inlineImageChoice, setInlineImageChoice] = useState("none");

  // Geekhack import
  const [ghUrl, setGhUrl] = useState("");
  const [ghImporting, setGhImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      try {
        const res = await fetch("/api/keycap-profiles", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const rawProfiles: unknown[] = Array.isArray(data?.profiles) ? data.profiles : [];
        const profiles = rawProfiles.filter((p: unknown): p is string => typeof p === "string");
        if (!cancelled && profiles.length > 0) {
          setProfileOptions(Array.from(new Set<string>(profiles)).sort((a, b) => a.localeCompare(b)));
        }
      } catch {
        // keep fallback PROFILE_OPTIONS
      }
    }

    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGeekhackImport = async () => {
    const trimmed = ghUrl.trim();
    if (!trimmed) {
      toast.error("Please enter a Geekhack URL");
      return;
    }
    setGhImporting(true);
    try {
      const res = await fetch("/api/import/geekhack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        return;
      }
      const prefill: GeekhackPrefillPayload = data.prefill;
      setFormData((prev) => ({
        ...prev,
        title: prefill.title || prev.title,
        slug: prefill.title ? generateSlug(prefill.title) : prev.slug,
        description: prefill.description || prev.description,
        category: prefill.category || prev.category,
        status: prefill.status || prev.status,
        tags: Array.from(new Set([...prev.tags, ...prefill.tags])),
        links: [
          ...prev.links,
          ...prefill.links.map((l) => ({ label: l.label, url: l.url, type: l.type as "GEEKHACK" })),
        ],
        images: [
          ...prev.images,
          ...prefill.images.map((img, i) => ({
            url: img.url,
            alt: img.alt ?? "",
            order: prev.images.length + i,
            linkUrl: null,
            openInNewTab: true,
          })),
        ],
      }));
      toast.success(`Imported "${prefill.title}" from Geekhack`);
    } catch {
      toast.error("Network error – could not reach server");
    } finally {
      setGhImporting(false);
    }
  };

  const updateField = <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleChange = (title: string) => {
    updateField("title", title);
    if (!isEditing) {
      updateField("slug", generateSlug(title));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      updateField("tags", [...formData.tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    updateField(
      "tags",
      formData.tags.filter((t) => t !== tag)
    );
  };

  const addLink = () => {
    updateField("links", [
      ...formData.links,
      { label: "", url: "", type: "OTHER" as const },
    ]);
  };

  const updateLink = (
    index: number,
    field: string,
    value: string
  ) => {
    const newLinks = [...formData.links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    updateField("links", newLinks);
  };

  const removeLink = (index: number) => {
    updateField(
      "links",
      formData.links.filter((_, i) => i !== index)
    );
  };

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const galleryImagesForInlineInsert = formData.images
    .map((image, index) => ({
      index,
      url: image.url?.trim() ?? "",
      alt: image.alt?.trim() ?? "",
    }))
    .filter((image) => image.url.length > 0);

  const buildInlineImageBlock = (image: { url: string; alt: string }) => {
    const safeUrl = escapeHtml(image.url);
    const safeAlt = escapeHtml(image.alt || "Project image");
    const captionText = image.alt || "Project gallery image";

    return `<figure class="project-inline-image" style="margin:1.5rem 0; text-align:center;"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" decoding="async" style="max-width:100%; height:auto; border-radius:0.5rem; display:inline-block;" /><figcaption style="margin-top:0.5rem; color:#6b7280; font-size:0.875rem;">${escapeHtml(captionText)}</figcaption></figure><p></p>`;
  };

  const saveProject = async (
    intent: "draft" | "review" | "publish" | "preview",
    options?: { redirectToPreview?: boolean }
  ) => {
    if (intent === "publish" && !(formData.heroImage ?? "").trim()) {
      setHeroImageError(true);
      toast.error("Hero image is required to publish");
      heroCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setHeroImageError(false);
    setIsSubmitting(true);

    try {
      const baseUrl = isEditing ? `/api/projects/${project.id}` : "/api/projects";
      const url = `${baseUrl}?intent=${intent}`;
      const method = isEditing ? "PUT" : "POST";

      // Filter out vendor entries with no vendor selected before submitting
      const submitData = {
        ...formData,
        published:
          intent === "publish"
            ? true
            : intent === "draft" || intent === "review"
              ? false
              : Boolean(formData.published),
        images: (formData.images ?? []).map((image, index) => ({
          ...image,
          order: index,
        })),
        projectVendors: (formData.projectVendors ?? []).filter((pv) => pv.vendorId),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save project");
      }

      const savedProject = await res.json();

      if (options?.redirectToPreview) {
        toast.success("Saved. Opening preview...");
        const returnTo =
          mode === "admin"
            ? isEditing
              ? `/admin/projects/${savedProject.id}/edit`
              : "/admin/projects/new"
            : isEditing
              ? `/projects/submit/${savedProject.id}/edit`
              : "/projects/submit";
        router.push(`/projects/preview/${savedProject.id}?returnTo=${encodeURIComponent(returnTo)}`);
        router.refresh();
        return;
      }

      if (intent === "draft") {
        toast.success("Draft saved");
      } else {
        toast.success(isEditing ? "Project updated and published" : "Project created and published");
      }

      router.push(mode === "submit" ? "/profile" : "/admin/projects");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProject("publish");
  };

  const handleSaveDraft = async () => {
    await saveProject("draft");
  };

  const handlePreview = async () => {
    await saveProject("preview", { redirectToPreview: true });
  };

  const formatDateForInput = (date: Date | string | null | undefined) => {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  };

  const sections = [
    { id: "basic-info", label: "Basic Info" },
    { id: "pricing", label: "Pricing" },
    { id: "vendors", label: "Vendors" },
    { id: "timeline", label: "Timeline" },
    { id: "hero-image", label: "Hero Image" },
    { id: "gallery", label: "Gallery" },
    { id: "tags", label: "Tags" },
    { id: "links", label: "Links" },
    ...(mode === "admin" ? [{ id: "settings", label: "Settings" }] : []),
  ];

  const [activeSection, setActiveSection] = useState("basic-info");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSectionNav = showSectionNavProp ?? mode === "submit";

  return (
    <div className="flex items-start gap-8">
      {showSectionNav && (
        <nav className="sticky top-24 hidden w-56 shrink-0 self-start lg:block">
          <div className="max-h-[calc(100vh-7rem)] space-y-1 overflow-auto">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => {
                  const el = document.getElementById(s.id);
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  el.classList.add("ring-2", "ring-primary/50");
                  setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 1500);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-6">
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Import from Geekhack</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                data-testid="geekhack-url-input"
                placeholder="https://geekhack.org/index.php?topic=12345.0"
                value={ghUrl}
                onChange={(e) => setGhUrl(e.target.value)}
                disabled={ghImporting}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleGeekhackImport}
                disabled={ghImporting}
                data-testid="geekhack-import-btn"
              >
                {ghImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Import
              </Button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Paste a Geekhack IC/GB thread URL to auto-fill project fields.
            </p>
          </CardContent>
        </Card>
      )}

      <Card id="basic-info">
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => updateField("slug", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) =>
                  updateField("category", v as ProjectFormData["category"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) =>
                  updateField("status", v as ProjectFormData["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Keycap Profile</Label>
              <Select
                value={formData.profile ?? "none"}
                onValueChange={(v) =>
                  updateField("profile", v === "none" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No profile</SelectItem>
                  {profileOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="designer">Designer</Label>
              <Input
                id="designer"
                value={formData.designer ?? ""}
                onChange={(e) => updateField("designer", e.target.value || null)}
                placeholder="Designer name"
                maxLength={100}
              />
            </div>
          </div>

          {mode === "admin" && (
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.shipped}
                  onChange={(e) => updateField("shipped", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Shipped</span>
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Suspense fallback={<div className="border-input h-[168px] animate-pulse rounded-md border" />}>
              <RichTextEditor
                content={formData.description ?? ""}
                onChange={(html) => updateField("description", html)}
                placeholder="Describe your project..."
                toolbarExtra={({ editor }) => (
                  <Select
                    value={inlineImageChoice}
                    onValueChange={(value) => {
                      if (value === "none") {
                        setInlineImageChoice("none");
                        return;
                      }

                      const selectedImage = galleryImagesForInlineInsert.find(
                        (image) => String(image.index) === value
                      );

                      if (!selectedImage) {
                        toast.error("Selected gallery image is no longer available");
                        setInlineImageChoice("none");
                        return;
                      }

                      editor.chain().focus().insertContent(buildInlineImageBlock(selectedImage)).run();
                      // Ensure parent form state is immediately synchronized with editor content.
                      updateField("description", editor.getHTML());
                      setInlineImageChoice("none");
                    }}
                  >
                    <SelectTrigger
                      className="h-8 w-44 text-xs"
                      aria-label="Insert image"
                      disabled={galleryImagesForInlineInsert.length === 0}
                    >
                      <SelectValue placeholder="Insert image" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Insert image
                      </SelectItem>
                      {galleryImagesForInlineInsert.length === 0 ? (
                        <SelectItem value="empty" disabled>
                          Add gallery images first
                        </SelectItem>
                      ) : (
                        galleryImagesForInlineInsert.map((image, idx) => (
                          <SelectItem key={image.index} value={String(image.index)}>
                            {image.alt || `Image ${idx + 1}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </Suspense>
          </div>

        </CardContent>
      </Card>

      <Card id="pricing">
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="priceMin">Price Min ($)</Label>
              <PriceInput
                id="priceMin"
                valueCents={formData.priceMin}
                onValueCents={(cents) => updateField("priceMin", cents)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceMax">Price Max ($)</Label>
              <PriceInput
                id="priceMax"
                valueCents={formData.priceMax}
                onValueCents={(cents) => updateField("priceMax", cents)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formData.currency}
                onChange={(e) => updateField("currency", e.target.value)}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD (C$)</option>
                <option value="AUD">AUD (A$)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="KRW">KRW (₩)</option>
                <option value="CNY">CNY (¥)</option>
                <option value="SGD">SGD (S$)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="vendors">
        <CardHeader>
          <CardTitle>Vendors (Regional)</CardTitle>
        </CardHeader>
        <CardContent>
          <VendorMultiSelect
            vendors={vendors}
            value={(formData.projectVendors ?? []).map((pv) => {
              const vendorDefaults = vendors.find((v) => v.id === pv.vendorId);
              return {
                vendorId: pv.vendorId,
                region: (pv.region ?? "") || (vendorDefaults?.regionsServed?.join(", ") ?? ""),
                storeLink: (pv.storeLink ?? "") || (vendorDefaults?.storefrontUrl ?? ""),
                customVendorName: (pv as { customVendorName?: string | null }).customVendorName ?? "",
              };
            })}
            onChange={(entries) =>
              updateField(
                "projectVendors",
                entries.map((e) => ({
                  vendorId: e.vendorId,
                  region: e.region,
                  storeLink: e.storeLink,
                  customVendorName: e.customVendorName || null,
                }))
              )
            }
          />
        </CardContent>
      </Card>

      <Card id="timeline">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="icDate">IC Date</Label>
              <Input
                id="icDate"
                type="date"
                value={formatDateForInput(formData.icDate)}
                onChange={(e) =>
                  updateField(
                    "icDate",
                    e.target.value ? new Date(e.target.value) : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gbStartDate">GB Start</Label>
              <Input
                id="gbStartDate"
                type="date"
                value={formatDateForInput(formData.gbStartDate)}
                onChange={(e) =>
                  updateField(
                    "gbStartDate",
                    e.target.value ? new Date(e.target.value) : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gbEndDate">GB End</Label>
              <Input
                id="gbEndDate"
                type="date"
                value={formatDateForInput(formData.gbEndDate)}
                onChange={(e) =>
                  updateField(
                    "gbEndDate",
                    e.target.value ? new Date(e.target.value) : null
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedDelivery">Est. Delivery</Label>
              <Input
                id="estimatedDelivery"
                type="text"
                placeholder="Q3 2026"
                value={formData.estimatedDelivery ?? ""}
                onChange={(e) =>
                  updateField(
                    "estimatedDelivery",
                    e.target.value || null
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="hero-image" ref={heroCardRef} className={heroImageError ? "border-destructive ring-destructive/20 ring-2" : undefined}>
        <CardHeader>
          <CardTitle>Hero Image</CardTitle>
          {heroImageError && (
            <p className="text-destructive text-sm">Hero image is required before publishing.</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <ImageUpload
            value={formData.heroImage ?? undefined}
            onChange={(url) => {
              updateField("heroImage", url);
              if (url?.trim()) setHeroImageError(false);
            }}
            onRemove={() => {
              updateField("heroImage", null);
            }}
          />
        </CardContent>
      </Card>


      <Card id="gallery">
        <CardHeader>
          <CardTitle>Gallery Studio</CardTitle>
          <p className="text-muted-foreground text-sm">
            Build your gallery visually: upload multiple images, paste one or many URLs, preview, reorder, and edit image metadata.
          </p>
        </CardHeader>
        <CardContent>
          <GalleryStudio
            images={formData.images}
            onChange={(images) => updateField("images", images)}
          />
        </CardContent>
      </Card>

      <Card id="tags">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="links">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Links
            <Button type="button" variant="outline" size="sm" onClick={addLink}>
              <Plus className="mr-1 h-4 w-4" />
              Add Link
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.links.map((link, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label>Label</Label>
                <Input
                  value={link.label}
                  onChange={(e) => updateLink(i, "label", e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label>URL</Label>
                <Input
                  value={link.url}
                  onChange={(e) => updateLink(i, "url", e.target.value)}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label>Type</Label>
                <Select
                  value={link.type}
                  onValueChange={(v) => updateLink(i, "type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEEKHACK">Geekhack</SelectItem>
                    <SelectItem value="WEBSITE">Website</SelectItem>
                    <SelectItem value="DISCORD">Discord</SelectItem>
                    <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                    <SelectItem value="REDDIT">Reddit</SelectItem>
                    <SelectItem value="STORE">Store</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => removeLink(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {formData.links.length === 0 && (
            <p className="text-muted-foreground text-sm">No links added</p>
          )}
        </CardContent>
      </Card>

      {mode === "admin" && (
        <Card id="settings">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.published}
                  onChange={(e) => updateField("published", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Published</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.featured}
                  onChange={(e) => updateField("featured", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Featured</span>
              </label>
            </div>
            {project?.id && project?.creator?.id && (
              <ProjectOwnershipTransfer
                projectId={project.id}
                currentOwner={{
                  id: project.creator.id,
                  name: project.creator.name ?? null,
                }}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="metaTitle">Meta Title</Label>
                <Input
                  id="metaTitle"
                  value={formData.metaTitle ?? ""}
                  onChange={(e) =>
                    updateField("metaTitle", e.target.value || null)
                  }
                  maxLength={70}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaDescription">Meta Description</Label>
                <Input
                  id="metaDescription"
                  value={formData.metaDescription ?? ""}
                  onChange={(e) =>
                    updateField("metaDescription", e.target.value || null)
                  }
                  maxLength={160}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="button" variant="outline" onClick={handlePreview} disabled={isSubmitting}>
          <Eye className="mr-2 h-4 w-4" />
          Preview
        </Button>
        <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Draft
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publish
        </Button>
      </div>
    </form>
    </div>
  );
}
