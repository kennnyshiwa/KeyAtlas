"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectGrid } from "@/components/projects/project-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
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
          <ProjectGrid projects={projects} />
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
