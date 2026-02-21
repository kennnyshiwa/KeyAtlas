"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Eye, Pencil, Plus } from "lucide-react";
import { ApiKeyManager } from "@/components/profile/api-key-manager";
import { ApiDocs } from "@/components/profile/api-docs";
import { ProfileSettings } from "@/components/profile/profile-settings";
import type { ProjectListItem } from "@/types";

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface ProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
}

interface ProfileTabsProps {
  projects: ProjectListItem[];
  favorites: ProjectListItem[];
  collection: ProjectListItem[];
  apiKeys: ApiKeyInfo[];
  user: ProfileUser;
  defaultTab?: "projects" | "favorites" | "collection" | "api" | "settings";
}

export function ProfileTabs({ projects, favorites, collection, apiKeys, user, defaultTab = "projects" }: ProfileTabsProps) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="projects">
          My Projects ({projects.length})
        </TabsTrigger>
        <TabsTrigger value="favorites">
          Favorites ({favorites.length})
        </TabsTrigger>
        <TabsTrigger value="collection">
          Collection ({collection.length})
        </TabsTrigger>
        <TabsTrigger value="api">
          API
        </TabsTrigger>
        <TabsTrigger value="settings">
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="mt-4">
        {projects.length > 0 ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link href={project.published ? `/projects/${project.slug}` : `/projects/submit/${project.id}/edit`} className="font-semibold hover:underline">
                        {project.title}
                      </Link>
                      {project.published ? (
                        <Badge className="bg-emerald-600 text-white">Published</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white">Draft / Pending Review</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {project.published ? "Visible publicly" : "Private until reviewed/published"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!project.published && (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/projects/submit/${project.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/projects/preview/${project.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Preview
                          </Link>
                        </Button>
                      </>
                    )}
                    {project.published && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/projects/${project.slug}`}>
                          View
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No projects yet"
            description="Submit your first project to get started."
          >
            <Button asChild>
              <Link href="/projects/submit">
                <Plus className="mr-2 h-4 w-4" />
                Submit a Project
              </Link>
            </Button>
          </EmptyState>
        )}
      </TabsContent>
      <TabsContent value="favorites" className="mt-4">
        {favorites.length > 0 ? (
          <ProjectGrid projects={favorites} />
        ) : (
          <EmptyState
            title="No favorites yet"
            description="Heart projects you like to save them here."
          />
        )}
      </TabsContent>
      <TabsContent value="collection" className="mt-4">
        {collection.length > 0 ? (
          <ProjectGrid projects={collection} />
        ) : (
          <EmptyState
            title="No items in collection"
            description="Add projects to your collection to track them here."
          />
        )}
      </TabsContent>
      <TabsContent value="api" className="mt-4 space-y-6">
        <ApiKeyManager initialKeys={apiKeys} />
        <ApiDocs />
      </TabsContent>
      <TabsContent value="settings" className="mt-4">
        <ProfileSettings user={user} />
      </TabsContent>
    </Tabs>
  );
}
