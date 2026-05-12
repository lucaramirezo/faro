import { Badge } from "@/components/ui/badge";
import { getProfile } from "@/lib/profiles";

export function ProfileSlug() {
  const profile = getProfile();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold tracking-tight">faro/{profile.profile}</span>
      <Badge variant={profile.status === "active" ? "default" : "secondary"}>
        ● {profile.status}
      </Badge>
    </div>
  );
}
