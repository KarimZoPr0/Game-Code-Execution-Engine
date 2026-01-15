import React from "react";
import { usePlaygroundStore } from "@/store/playgroundStore";
import { ChevronDown } from "lucide-react";

const BuildProfileSelector: React.FC = () => {
    const { buildConfig, selectedProfile, setSelectedProfile } = usePlaygroundStore();

    // Compute profiles first (before any hooks)
    const profiles = buildConfig ? Object.keys(buildConfig) : [];

    // Auto-select first profile if none selected
    // This hook must be called unconditionally (before any early returns)
    React.useEffect(() => {
        if (buildConfig && !selectedProfile && profiles.length > 0) {
            setSelectedProfile(profiles[0]);
        }
    }, [buildConfig, selectedProfile, profiles, setSelectedProfile]);

    // Early returns after all hooks
    if (!buildConfig) return null;
    if (profiles.length === 0) return null;

    return (
        <div className="relative inline-block">
            <select
                value={selectedProfile || profiles[0] || ""}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="appearance-none bg-muted text-foreground text-xs px-2 py-1 pr-6 rounded border border-panel-border cursor-pointer hover:bg-muted/80 focus:outline-none focus:ring-1 focus:ring-primary"
                title="Build profile"
            >
                {profiles.map((profile) => (
                    <option key={profile} value={profile}>
                        {profile}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
        </div>
    );
};

export default BuildProfileSelector;
