import type {
  Project,
  ProjectImage,
  ProjectLink,
  Vendor,
  User,
} from "@/generated/prisma/client";

export type ProjectWithRelations = Project & {
  images: ProjectImage[];
  links: ProjectLink[];
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
  | "gbStartDate"
  | "gbEndDate"
> & {
  vendor: Pick<Vendor, "name" | "slug"> | null;
  _count?: { favorites: number };
};
