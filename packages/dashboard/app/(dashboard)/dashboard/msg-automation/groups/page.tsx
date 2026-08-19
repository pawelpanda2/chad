"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeeperGroupsView, type GroupsSubTab } from "@/components/beeper/beeper-groups-view";

/**
 * Standalone Groups page — a dedicated Msg Automation entry point for the
 * same `BeeperGroupsView` MultiView's own "Groups" tab already uses
 * (Story 101), reachable directly instead of only via MultiView → Groups.
 * Toolbar (List|Manage sub-tabs, Search, item count) mirrors MultiView's
 * own Groups-tab row verbatim — `BeeperGroupsView` itself never renders a
 * search input, the page toolbar always owns that.
 */
export default function GroupsPage() {
  const [subTab, setSubTab] = useState<GroupsSubTab>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [contactsCount, setContactsCount] = useState<number | null>(null);

  return (
    <DashboardPageShell title="Groups">
      <div className="mb-1.5 flex w-full shrink-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as GroupsSubTab)}>
            <TabsList aria-label="Groups view">
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="manage">Manage</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="h-10 w-[140px] rounded-[9px] pl-7 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search"
            />
          </div>
          {subTab === "list" && contactsCount !== null && (
            <span className="text-sm text-muted-foreground">{contactsCount} items</span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BeeperGroupsView
          subTab={subTab}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onCountChange={setContactsCount}
        />
      </div>
    </DashboardPageShell>
  );
}
