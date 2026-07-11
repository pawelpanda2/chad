import { ContentBrowser } from "@/components/ContentBrowser";
import { DeveloperLogs } from "@/components/DeveloperLogs";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <ContentBrowser />
      <div className="container mx-auto px-4">
        <DeveloperLogs />
      </div>
    </div>
  );
}
