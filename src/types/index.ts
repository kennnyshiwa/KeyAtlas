import type {
  Project,
  ProjectImage,
  ProjectLink,
  SoundTest,
  Vendor,
  User,
} from "@/generated/prisma/client";

export type ProjectWithRelations = Project & {
  images: ProjectImage[];
  links: ProjectLink[];
  soundTests?: SoundTest[];
  vendor: Vendor | null;
  creator: Pick<User, "id" | "name" | "image">;
};

export type ProjectListItem = Pick<
  Project,
  | "id"
  | "title"
  | "slug"
  | "category"
  | "status"
  | "priceMin"
  | "priceMax"
  | "currency"
  | "heroImage"
  | "tags"
  | "featured"
  | "published"
  | "profile"
  | "designer"
  | "shipped"
  | "createdAt"
  | "updatedAt"
  | "gbStartDate"
  | "gbEndDate"
> & {
  vendor: Pick<Vendor, "name" | "slug"> | null;
  _count?: { favorites: number };
  /** Plain-text preview of the project description (first ~120 chars, HTML stripped). */
  descriptionPreview?: string | null;
};
