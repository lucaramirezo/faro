import { Badge } from "@/components/ui/badge";
import { type AuthMode, detectAuthMode } from "@/lib/auth-mode";

const LABEL: Record<AuthMode, string> = {
  oauth: "OAuth · Max",
  api_key: "API key",
};

export function AuthModePill() {
  const mode = detectAuthMode();
  return (
    <Badge variant={mode === "oauth" ? "default" : "secondary"} className="text-xs">
      {LABEL[mode]}
    </Badge>
  );
}
