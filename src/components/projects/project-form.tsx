"use client";

import { useState, useEffect, useRef, lazy, Suspense, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/shared/image-upload";
import { GalleryStudio } from "@/components/projects/gallery-studio";
import { VendorMultiSelect } from "@/components/projects/vendor-multi-select";
import { ProjectOwnershipTransfer } from "@/components/projects/project-ownership-transfer";
import { CATEGORY_LABELS, STATUS_LABELS, PROFILE_OPTIONS } from "@/lib/constants";
import { generateSlug } from "@/lib/utils";
import type { ProjectFormData } from "@/lib/validations/project";
import type { ProjectWithRelations } from "@/types";
import { Plus, Trash2, Loader2, Eye, Download, Save } from "lucide-react";
import { toast } from "sonner";
import type { UrlImportPrefillPayload } from "@/lib/import/url-prefill";

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
  templateProjects?: {
    id: string;
    title: string;
    slug: string;
    category: ProjectFormData["category"];
    status: ProjectFormData["status"];
    description: string | null;
    tags: string[];
    designer: string | null;
    profile: string | null;
    currency: string;
    priceMin: number | null;
    priceMax: number | null;
    estimatedDelivery: string | null;
    images: { url: string; alt: string | null; order: number; linkUrl: string | null; openInNewTab: boolean }[];
    links: { label: string; url: string; type: ProjectFormData["links"][number]["type"] }[];
    projectVendors: { vendorId: string; region: string | null; storeLink: string | null; endDate: Date | null }[];
  }[];
  mode?: "admin" | "submit";
  showSectionNav?: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function PriceInput({ id, valueCents, onValueCents }: { id: string; valueCents: number | null | undefined; onValueCents: (v: number | null) => void }) {
  const [display, setDisplay] = useState(valueCents != null ? (valueCents / 100).toString() : "");
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
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
        if (raw !== "" && !/^\d*\.?\d{0,2}$/.test(raw)) return;
        setDisplay(raw);
        if (raw === "" || raw === ".") {
          onValueCents(null);
        } else {
          onValueCents(Math.round(Number(raw) * 100));
        }
      }}
      onBlur={() => {
        if (valueCents != null) {
          setDisplay((valueCents / 100).toFixed(2));
        } else {
          setDisplay("");
        }
      }}
    />
  );
}

export function ProjectForm({ project, vendors = [], templateProjects = [], mode = "admin", showSectionNav: showSectionNavProp }: ProjectFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isEditing = !!project;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
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
  const [bulkLinkInput, setBulkLinkInput] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [templateProjectId, setTemplateProjectId] = useState("none");
  const [importSummary, setImportSummary] = useState<{
    fieldsPrefilled: number;
    linksDetected: number;
    estimatedSections: number;
  } | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(formData));
  const suppressAutosaveRef = useRef(false);

  const draftStorageKey = useMemo(() => {
    const owner = mode === "admin" ? "admin" : "submit";
    return `keyvault:project-draft:${owner}:${project?.id ?? "new"}`;
  }, [mode, project?.id]);

  const serializeForm = (value: ProjectFormData) =>
    JSON.stringify({
      ...value,
      icDate: value.icDate ? new Date(value.icDate).toISOString() : null,
      gbStartDate: value.gbStartDate ? new Date(value.gbStartDate).toISOString() : null,
      gbEndDate: value.gbEndDate ? new Date(value.gbEndDate).toISOString() : null,
      images: (value.images ?? []).map((image, index) => ({ ...image, order: index })),
    });

  const parseLinkType = (url: string): ProjectFormData["links"][number]["type"] => {
    const lower = url.toLowerCase();
    if (lower.includes("geekhack.org")) return "GEEKHACK";
    if (lower.includes("discord.")) return "DISCORD";
    if (lower.includes("instagram.")) return "INSTAGRAM";
    if (lower.includes("reddit.")) return "REDDIT";
    if (lower.includes("shop") || lower.includes("store")) return "STORE";
    return "WEBSITE";
  };

  const saveToLocalDraft = (value: ProjectFormData) => {
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          version: 1,
          updatedAt: Date.now(),
          formData: {
            ...value,
            icDate: value.icDate ? new Date(value.icDate).toISOString() : null,
            gbStartDate: value.gbStartDate ? new Date(value.gbStartDate).toISOString() : null,
            gbEndDate: value.gbEndDate ? new Date(value.gbEndDate).toISOString() : null,
          },
        })
      );
    } catch {
      setSaveState("error");
    }
  };

  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // no-op
    }
  };

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { formData?: Partial<ProjectFormData> };
      const recovered = parsed.formData;
      if (!recovered) return;

      setFormData((prev) => ({
        ...prev,
        ...recovered,
        icDate: recovered.icDate ? new Date(recovered.icDate) : prev.icDate,
        gbStartDate: recovered.gbStartDate ? new Date(recovered.gbStartDate) : prev.gbStartDate,
        gbEndDate: recovered.gbEndDate ? new Date(recovered.gbEndDate) : prev.gbEndDate,
      }));
      setDraftRecovered(true);
      toast.success("Recovered unsaved draft from this device");
    } catch {
      // ignore malformed local draft data
    }
  }, [draftStorageKey]);

  const updateField = <K extends keyof ProjectFormData>(
    key: K,
    value: ProjectFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (suppressAutosaveRef.current) {
      suppressAutosaveRef.current = false;
      return;
    }

    const timeout = window.setTimeout(async () => {
      const snapshot = serializeForm(formData);
      saveToLocalDraft(formData);

      if (snapshot === lastSavedSnapshotRef.current) return;

      if (!formData.title.trim() || !formData.slug.trim()) {
        setSaveState("saved");
        setLastSavedAt(new Date());
        return;
      }

      setSaveState("saving");
      try {
        const method = isEditing ? "PUT" : "POST";
        const baseUrl = isEditing ? `/api/projects/${project.id}` : "/api/projects";
        const submitData = {
          ...formData,
          published: false,
          images: (formData.images ?? []).map((image, index) => ({
            ...image,
            order: index,
          })),
          projectVendors: (formData.projectVendors ?? []).filter((pv) => pv.vendorId),
        };

        const res = await fetch(`${baseUrl}?intent=draft`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitData),
        });

        if (!res.ok) {
          throw new Error("Autosave failed");
        }

        const savedProject = await res.json();

        if (!isEditing && savedProject?.id) {
          const nextPath =
            mode === "admin"
              ? `/admin/projects/${savedProject.id}/edit`
              : `/projects/submit/${savedProject.id}/edit`;
          if (pathname !== nextPath) {
            router.replace(nextPath);
          }
        }

        setSaveState("saved");
        setLastSavedAt(new Date());
        lastSavedSnapshotRef.current = snapshot;
      } catch {
        setSaveState("error");
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [formData, isEditing, mode, pathname, project?.id, router]);

  const hasUnsavedChanges = serializeForm(formData) !== lastSavedSnapshotRef.current;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsavedChanges]);

  const countPrefilledFields = (before: ProjectFormData, after: ProjectFormData) => {
    let count = 0;
    const scalarKeys: Array<keyof ProjectFormData> = [
      "title",
      "description",
      "designer",
      "estimatedDelivery",
      "heroImage",
      "metaTitle",
      "metaDescription",
    ];

    for (const key of scalarKeys) {
      const beforeValue = before[key];
      const afterValue = after[key];
      if (!beforeValue && afterValue) count += 1;
    }

    if ((before.tags?.length ?? 0) === 0 && (after.tags?.length ?? 0) > 0) count += 1;
    if ((before.links?.length ?? 0) === 0 && (after.links?.length ?? 0) > 0) count += 1;
    if (!before.gbStartDate && after.gbStartDate) count += 1;
    if (!before.gbEndDate && after.gbEndDate) count += 1;

    return count;
  };

  const handleUrlImport = async () => {
    const trimmed = sourceUrl.trim();
    if (!trimmed) {
      toast.error("Please enter a URL to import");
      return;
    }
    setImportingUrl(true);
    try {
      const res = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        return;
      }

      const prefill: UrlImportPrefillPayload = data.prefill;
      const nextFormData: ProjectFormData = {
        ...formData,
        title: prefill.title || formData.title,
        slug: prefill.title ? generateSlug(prefill.title) : formData.slug,
        description: prefill.description || formData.description,
        category: prefill.category || formData.category,
        status: prefill.status || formData.status,
        tags: Array.from(new Set([...(formData.tags ?? []), ...(prefill.tags ?? [])])),
        designer: prefill.designer ?? formData.designer,
        estimatedDelivery: prefill.estimatedDelivery ?? formData.estimatedDelivery,
        gbStartDate: prefill.gbStartDate ? new Date(prefill.gbStartDate) : formData.gbStartDate,
        gbEndDate: prefill.gbEndDate ? new Date(prefill.gbEndDate) : formData.gbEndDate,
        links: [
          ...(formData.links ?? []),
          ...(prefill.links ?? []).map((link) => ({ label: link.label, url: link.url, type: link.type })),
        ],
      };

      setFormData(nextFormData);
      const linksDetected = Math.max((prefill.links ?? []).length, nextFormData.links.length - formData.links.length);
      const fieldsPrefilled = countPrefilledFields(formData, nextFormData);
      const estimatedSections = [
        prefill.title,
        prefill.description,
        prefill.status,
        prefill.gbStartDate || prefill.gbEndDate,
        (prefill.links ?? []).length > 0,
      ].filter(Boolean).length;

      setImportSummary({ fieldsPrefilled, linksDetected, estimatedSections });
      toast.success(`Imported source hints: ${fieldsPrefilled} fields prefilled, ${linksDetected} links detected.`);
    } catch {
      toast.error("Network error – could not reach server");
    } finally {
      setImportingUrl(false);
    }
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

  const addBulkLinks = () => {
    const urls = bulkLinkInput
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => /^https?:\/\//i.test(item));

    if (urls.length === 0) {
      toast.error("Paste one or more valid URLs");
      return;
    }

    const newLinks = urls
      .filter((url) => !formData.links.some((link) => link.url === url))
      .map((url) => ({
        label: new URL(url).hostname.replace(/^www\./, ""),
        url,
        type: parseLinkType(url),
      }));

    if (newLinks.length === 0) {
      toast.info("All pasted URLs are already in your links list");
      return;
    }

    updateField("links", [...formData.links, ...newLinks]);
    setBulkLinkInput("");
    toast.success(`Added ${newLinks.length} link${newLinks.length > 1 ? "s" : ""}`);
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

  const applyTemplate = () => {
    const selected = templateProjects.find((item) => item.id === templateProjectId);
    if (!selected) return;

    suppressAutosaveRef.current = true;
    setFormData((prev) => ({
      ...prev,
      title: `${selected.title} (Copy)`,
      slug: generateSlug(`${selected.title}-copy`),
      category: selected.category,
      status: selected.status,
      description: selected.description ?? "",
      tags: selected.tags ?? [],
      designer: selected.designer ?? null,
      profile: selected.profile ?? null,
      currency: selected.currency,
      priceMin: selected.priceMin,
      priceMax: selected.priceMax,
      estimatedDelivery: selected.estimatedDelivery,
      images: selected.images.map((image, index) => ({ ...image, order: index, alt: image.alt ?? undefined })),
      links: selected.links,
      projectVendors: selected.projectVendors.map((vendor) => ({ ...vendor, region: vendor.region ?? "", storeLink: vendor.storeLink ?? "" })),
      published: false,
      featured: false,
    }));
    toast.success("Template applied. Adjust details and publish when ready.");
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

  const getPublishValidationErrors = () => {
    const errors: Array<{ id: string; message: string }> = [];
    if (!formData.title.trim()) errors.push({ id: "title", message: "Title is required" });
    if (!formData.slug.trim()) errors.push({ id: "slug", message: "Slug is required" });
    if (!(formData.description ?? "").trim()) errors.push({ id: "description", message: "Description is required" });
    if (!(formData.heroImage ?? "").trim()) errors.push({ id: "hero-image", message: "Hero image is required" });

    if (formData.status === "GROUP_BUY") {
      if (!formData.projectVendors.length) {
        errors.push({ id: "vendors", message: "At least one vendor is required for Group Buy" });
      }
      if (!formData.gbStartDate) {
        errors.push({ id: "gbStartDate", message: "GB start date is required for Group Buy" });
      }
      if (!formData.gbEndDate) {
        errors.push({ id: "gbEndDate", message: "GB end date is required for Group Buy" });
      }
    }

    return errors;
  };

  const focusValidationField = (id: string) => {
    const element = document.getElementById(id) ?? document.querySelector(`[data-field="${id}"]`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      element.focus();
    }
  };

  const saveProject = async (
    intent: "draft" | "review" | "publish" | "preview",
    options?: { redirectToPreview?: boolean; silent?: boolean }
  ) => {
    if (intent === "publish") {
      const errors = getPublishValidationErrors();
      if (errors.length > 0) {
        const firstError = errors[0];
        setHeroImageError(firstError.id === "hero-image");
        focusValidationField(firstError.id);
        toast.error(firstError.message);
        return;
      }
    }

    setHeroImageError(false);
    setIsSubmitting(true);

    try {
      const baseUrl = isEditing ? `/api/projects/${project.id}` : "/api/projects";
      const url = `${baseUrl}?intent=${intent}`;
      const method = isEditing ? "PUT" : "POST";

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
      clearLocalDraft();
      lastSavedSnapshotRef.current = serializeForm(formData);
      setSaveState("saved");
      setLastSavedAt(new Date());

      if (options?.redirectToPreview) {
        if (!options.silent) toast.success("Saved. Opening preview...");
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
        if (!options?.silent) toast.success("Draft saved");
      } else {
        if (!options?.silent) toast.success(isEditing ? "Project updated and published" : "Project created and published");
      }

      router.push(mode === "submit" ? "/profile" : "/admin/projects");
      router.refresh();
    } catch (error) {
      setSaveState("error");
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
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

  const handleDeleteDraft = async () => {
    if (!project?.id || project.published) return;
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;

    setIsDeletingDraft(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to delete draft");
      }
      clearLocalDraft();
      toast.success("Draft deleted");
      router.push(mode === "submit" ? "/profile" : "/admin/projects");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete draft");
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const formatDateForInput = (date: Date | string | null | undefined) => {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  };

  const sections = [
    { id: "import-url", label: "URL Import" },
    { id: "basic-info", label: "Basic Info" },
    ...(formData.status === "GROUP_BUY"
      ? [
          { id: "vendors", label: "Vendors" },
          { id: "timeline", label: "GB Timeline" },
        ]
      : [{ id: "timeline", label: "Timeline" }, { id: "vendors", label: "Vendors" }]),
    { id: "pricing", label: "Pricing" },
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
  }, [formData.status]);

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
      <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-6 pb-24 md:pb-0">
      <Card className="border-primary/40 bg-primary/5" id="import-url" data-field="import-url">
          <CardHeader>
            <CardTitle>Start with a URL import (fastest for long Geekhack posts)</CardTitle>
            <p className="text-muted-foreground text-sm">
              Paste a Geekhack topic or vendor page and we&apos;ll prefill title, description, status/timeline hints, and links so you can polish instead of retyping.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                data-testid="source-url-input"
                placeholder="https://geekhack.org/... or vendor project page"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={importingUrl}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleUrlImport}
                disabled={importingUrl}
                data-testid="source-import-btn"
                className="min-h-11"
              >
                {importingUrl ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Import hints
              </Button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              We parse the page for title, status/date hints, links, and description snippets. Nothing is auto-published.
            </p>

            {importSummary && (
              <div className="rounded-md border bg-background/70 p-3 text-sm">
                <p className="font-medium">Import summary</p>
                <p className="text-muted-foreground text-xs">
                  {importSummary.fieldsPrefilled} fields prefilled • {importSummary.linksDetected} links detected • ~{importSummary.estimatedSections} sections imported
                </p>
              </div>
            )}

            {templateProjects.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <Label>Start from one of your existing projects</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={templateProjectId} onValueChange={setTemplateProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose project template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose template</SelectItem>
                      {templateProjects.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={applyTemplate} disabled={templateProjectId === "none"} className="min-h-11">
                    Duplicate as template
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      <Card id="basic-info" className="scroll-mt-24" data-field="basic-info">
        <CardHeader>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <CardTitle>Basic Information</CardTitle>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Save className="h-3.5 w-3.5" />
              {saveState === "saving" && "Saving draft..."}
              {saveState === "saved" && `Saved${lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString()}` : ""}`}
              {saveState === "error" && "Autosave failed (kept locally)"}
              {saveState === "idle" && draftRecovered && "Draft restored"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
            />
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

          <div className="space-y-2" data-field="description">
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

      <Card id="pricing" className="scroll-mt-24">
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
                className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

      <Card id="vendors" className="scroll-mt-24" data-field="vendors">
        <CardHeader>
          <CardTitle>Vendors (Regional)</CardTitle>
          {formData.status === "GROUP_BUY" && (
            <p className="text-amber-600 text-sm">Group Buy projects require at least one vendor.</p>
          )}
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

      <Card id="timeline" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{formData.status === "GROUP_BUY" ? "Group Buy Timeline" : "Timeline"}</CardTitle>
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

      <Card id="hero-image" ref={heroCardRef} className={`scroll-mt-24 ${heroImageError ? "border-destructive ring-destructive/20 ring-2" : ""}`} data-field="hero-image">
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


      <Card id="gallery" className="scroll-mt-24">
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

      <Card id="tags" className="scroll-mt-24">
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
            <Button type="button" variant="outline" onClick={addTag} className="min-h-11">
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

      <Card id="links" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Links
            <Button type="button" variant="outline" size="sm" onClick={addLink} className="min-h-11">
              <Plus className="mr-1 h-4 w-4" />
              Add Link
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="bulk-links">Paste multiple URLs</Label>
            <Textarea
              id="bulk-links"
              placeholder="Paste one URL per line or space-separated"
              value={bulkLinkInput}
              onChange={(e) => setBulkLinkInput(e.target.value)}
              className="min-h-[88px]"
            />
            <Button type="button" variant="secondary" onClick={addBulkLinks} className="min-h-11">
              Add pasted links
            </Button>
          </div>
          {formData.links.map((link, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-end sm:border-0 sm:p-0">
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
              <div className="w-full space-y-1 sm:w-32">
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
                className="min-h-11 min-w-11"
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
        <Card id="settings" className="scroll-mt-24">
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="flex flex-wrap justify-end gap-3">
          {isEditing && !project?.published && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteDraft}
              disabled={isSubmitting || isDeletingDraft}
              className="min-h-11"
            >
              {isDeletingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Draft
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return;
              router.back();
            }}
            className="min-h-11"
          >
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={handlePreview} disabled={isSubmitting} className="min-h-11">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={isSubmitting} className="min-h-11">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-h-11">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publish
          </Button>
        </div>
      </div>
    </form>
    </div>
  );
}
