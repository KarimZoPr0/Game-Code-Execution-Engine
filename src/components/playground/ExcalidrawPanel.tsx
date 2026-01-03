import { useCallback, useEffect, useState, useRef } from "react";
import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { usePlaygroundStore } from "@/store/playgroundStore";
import { useAuth } from "@/contexts/AuthContext";
import { getExcalidrawDrawing, saveExcalidrawDrawing } from "@/lib/storage/indexedDB";
import { syncExcalidrawToCloud, fetchCloudExcalidrawDrawing } from "@/lib/storage/cloudSync";
import { Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawData = any;

const DEFAULT_BG = "#1a1a24";

function toTheme(value: unknown): THEME {
  return value === "light" ? THEME.LIGHT : THEME.DARK;
}

export default function ExcalidrawPanel() {
  const { currentProject } = usePlaygroundStore();
  const { user } = useAuth();

  const [initialData, setInitialData] = useState<ExcalidrawData>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  // ✅ controlled theme so Alt+Shift+D actually updates the UI
  const [theme, setTheme] = useState<THEME>(THEME.DARK);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectIdRef = useRef<string | null>(null);

  // Load drawing when project changes
  useEffect(() => {
    if (!currentProject) return;

    const loadDrawing = async () => {
      setLoading(true);
      projectIdRef.current = currentProject.id;

      try {
        // Try local first
        let drawing = await getExcalidrawDrawing(currentProject.id);

        // If authenticated and no local drawing, try cloud
        if (!drawing && user) {
          drawing = await fetchCloudExcalidrawDrawing(user.id, currentProject.id);
          if (drawing) {
            await saveExcalidrawDrawing(currentProject.id, drawing);
          }
        }

        if (drawing) {
          // ✅ pick up saved theme if present
          const loadedTheme = toTheme(drawing?.appState?.theme);
          setTheme(loadedTheme);

          // ✅ ensure background exists (don’t overwrite if already set)
          setInitialData({
            ...drawing,
            appState: {
              ...drawing.appState,
              viewBackgroundColor: drawing?.appState?.viewBackgroundColor ?? DEFAULT_BG,
            },
          });
        } else {
          // Default empty canvas (dark)
          setTheme(THEME.DARK);
          setInitialData({
            elements: [],
            appState: {
              theme: "dark",
              viewBackgroundColor: DEFAULT_BG,
            },
          });
        }

        setKey((k) => k + 1);
      } catch (error) {
        console.error("Error loading drawing:", error);

        setTheme(THEME.DARK);
        setInitialData({
          elements: [],
          appState: {
            theme: "dark",
            viewBackgroundColor: DEFAULT_BG,
          },
        });
        setKey((k) => k + 1);
      } finally {
        setLoading(false);
      }
    };

    loadDrawing();

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [currentProject?.id, user]);

  // Debounced save + sync theme from Excalidraw appState (shortcut/UI)
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: any) => {
      if (!currentProject || projectIdRef.current !== currentProject.id) return;

      // ✅ keep our controlled theme in sync so Alt+Shift+D works
      if (appState?.theme) {
        setTheme(toTheme(appState.theme));
      }

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const data = { elements, appState };

        try {
          await saveExcalidrawDrawing(currentProject.id, data);
          if (user) {
            await syncExcalidrawToCloud(user.id, currentProject.id, data);
          }
        } catch (error) {
          console.error("Error saving drawing:", error);
        }
      }, 1000);
    },
    [currentProject?.id, user],
  );

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a24]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Excalidraw
        key={key}
        initialData={initialData}
        onChange={handleChange}
        theme={theme}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: true,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
}
