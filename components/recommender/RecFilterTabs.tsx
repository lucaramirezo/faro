"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RecFilterTabsProps {
  active: "all" | "skill" | "wiki";
  total: number;
  skillCount: number;
  wikiCount: number;
}

export function RecFilterTabs({ active, total, skillCount, wikiCount }: RecFilterTabsProps) {
  const router = useRouter();
  const onChange = (value: string) => {
    if (value === "all") router.push("/recommender");
    else router.push(`/recommender?source=${value}`);
  };
  return (
    <Tabs value={active} onValueChange={onChange} className="!flex-row">
      <TabsList>
        <TabsTrigger value="all">All ({total})</TabsTrigger>
        <TabsTrigger value="skill">Skill ({skillCount})</TabsTrigger>
        <TabsTrigger value="wiki">Wiki ({wikiCount})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
