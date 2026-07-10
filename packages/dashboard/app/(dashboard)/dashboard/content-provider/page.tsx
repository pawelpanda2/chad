"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw,
  FolderOpen,
  FileText,
  Link,
  AlertCircle,
  CheckCircle,
  Search,
} from "lucide-react";

interface Repo {
  id: string;
  name: string;
  path: string;
}

interface Node {
  id: string;
  type: string;
  name: string;
  address: string;
  path: string;
}

interface IndexStats {
  totalNodes: number;
  totalRefs: number;
  nodesByType: Record<string, number>;
  totalRepos: number;
}

interface IndexInfo {
  exists: boolean;
  stats: IndexStats;
  rootPath: string;
  hasBrokenRefs: boolean;
}

export default function ContentProviderPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [indexInfo, setIndexInfo] = useState<IndexInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch repositories
  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content-provider/repos");
      if (!response.ok) throw new Error("Failed to fetch repositories");
      const data = await response.json();
      setRepos(data.repos || []);
      if (data.repos && data.repos.length > 0 && !selectedRepo) {
        setSelectedRepo(data.repos[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch nodes for a repository
  const fetchNodes = async (repoId: string) => {
    try {
      const response = await fetch(`/api/content-provider/nodes?repoId=${repoId}`);
      if (!response.ok) throw new Error("Failed to fetch nodes");
      const data = await response.json();
      setNodes(data.nodes || []);
    } catch (err) {
      console.error("Error fetching nodes:", err);
    }
  };

  // Fetch index info
  const fetchIndexInfo = async () => {
    try {
      const response = await fetch("/api/content-provider/index");
      if (!response.ok) throw new Error("Failed to fetch index");
      const data = await response.json();
      setIndexInfo(data);
    } catch (err) {
      console.error("Error fetching index:", err);
    }
  };

  // Rebuild index
  const rebuildIndex = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/content-provider/index?action=rebuild", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to rebuild index");
      const data = await response.json();
      if (data.success) {
        fetchIndexInfo();
        fetchRepos();
        if (selectedRepo) {
          fetchNodes(selectedRepo);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebuild index");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchRepos();
    fetchIndexInfo();
  }, []);

  // Load nodes when repo changes
  useEffect(() => {
    if (selectedRepo) {
      fetchNodes(selectedRepo);
    }
  }, [selectedRepo]);

  // Filter nodes by search query
  const filteredNodes = nodes.filter(
    (node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Folder":
        return <FolderOpen className="h-4 w-4" />;
      case "Text":
        return <FileText className="h-4 w-4" />;
      case "Ref":
        return <Link className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Folder":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Text":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Ref":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Content Provider</h1>
          <p className="text-muted-foreground">
            Document store management interface
          </p>
        </div>
        <Button onClick={() => { fetchRepos(); fetchIndexInfo(); }} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="repos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="repos">Repositories</TabsTrigger>
          <TabsTrigger value="index">Index</TabsTrigger>
        </TabsList>

        <TabsContent value="repos" className="space-y-4">
          {/* Repositories List */}
          <Card>
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
              <CardDescription>
                List of all document repositories in the Content Provider system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {repos.length === 0 ? (
                <p className="text-muted-foreground">No repositories found</p>
              ) : (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <div
                      key={repo.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedRepo === repo.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedRepo(repo.id)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold">{repo.name}</h3>
                          <p className="text-sm text-muted-foreground font-mono">
                            {repo.id}
                          </p>
                        </div>
                        <Badge variant={selectedRepo === repo.id ? "default" : "outline"}>
                          {selectedRepo === repo.id ? "Selected" : "Select"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nodes List */}
          {selectedRepo && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Nodes</CardTitle>
                  <CardDescription>
                    Documents in repository: {repos.find((r) => r.id === selectedRepo)?.name}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search nodes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 border rounded-md text-sm w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {nodes.length === 0 ? (
                  <p className="text-muted-foreground">No nodes found in this repository</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNodes.map((node, index) => (
                        <TableRow key={`${node.id}-${index}`}>
                          <TableCell>
                            <Badge className={getTypeColor(node.type)}>
                              {getTypeIcon(node.type)}
                              <span className="ml-1">{node.type}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{node.name}</TableCell>
                          <TableCell className="font-mono text-sm">{node.address}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {node.id}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="index" className="space-y-4">
          {/* Index Statistics */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Global Index</CardTitle>
                <CardDescription>
                  Statistics and status of the Content Provider index
                </CardDescription>
              </div>
              <Button onClick={rebuildIndex} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Rebuild Index
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {indexInfo ? (
                <>
                  <div className="flex items-center gap-2">
                    {indexInfo.exists ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-green-700 dark:text-green-300">Index exists</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                        <span className="text-yellow-700 dark:text-yellow-300">Index missing</span>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Nodes</p>
                      <p className="text-2xl font-bold">{indexInfo.stats?.totalNodes || 0}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Repos</p>
                      <p className="text-2xl font-bold">{indexInfo.stats?.totalRepos || 0}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">References</p>
                      <p className="text-2xl font-bold">{indexInfo.stats?.totalRefs || 0}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Broken Refs</p>
                      <p className={`text-2xl font-bold ${indexInfo.hasBrokenRefs ? "text-red-500" : "text-green-500"}`}>
                        {indexInfo.hasBrokenRefs ? "⚠️ Yes" : "None"}
                      </p>
                    </div>
                  </div>

                  {indexInfo.stats?.nodesByType && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Nodes by Type:</p>
                      <div className="flex gap-2">
                        {Object.entries(indexInfo.stats.nodesByType).map(([type, count]) => (
                          <Badge key={type} variant="outline">
                            {getTypeIcon(type)}
                            <span className="ml-1">{type}: {count}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Root Path:</p>
                    <p className="font-mono text-sm break-all">{indexInfo.rootPath}</p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Loading index information...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}