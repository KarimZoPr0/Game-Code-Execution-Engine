import { useCallback, useEffect, useState, useRef } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { usePlaygroundStore } from '@/store/playgroundStore';
import { useAuth } from '@/contexts/AuthContext';
import { getExcalidrawDrawing, saveExcalidrawDrawing } from '@/lib/storage/indexedDB';
import { syncExcalidrawToCloud, fetchCloudExcalidrawDrawing } from '@/lib/storage/cloudSync';
import { Loader2 } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawData = any;

export default function ExcalidrawPanel() {
  const { currentProject } = usePlaygroundStore();
  const { user } = useAuth();
  const [initialData, setInitialData] = useState<ExcalidrawData>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0); // Force remount on project change
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
          // Save cloud data locally
          if (drawing) {
            await saveExcalidrawDrawing(currentProject.id, drawing);
          }
        }

        if (drawing) {
          setInitialData(drawing);
        } else {
          // Default empty canvas
          setInitialData({
            elements: [],
            appState: { viewBackgroundColor: '#1a1a24' },
          });
        }
        
        // Force remount to apply new initial data
        setKey((k) => k + 1);
      } catch (error) {
        console.error('Error loading drawing:', error);
        setInitialData({
          elements: [],
          appState: { viewBackgroundColor: '#1a1a24' },
        });
        setKey((k) => k + 1);
      } finally {
        setLoading(false);
      }
    };

    loadDrawing();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentProject?.id, user]);

  // Debounced save
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown) => {
      if (!currentProject || projectIdRef.current !== currentProject.id) return;

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save
      saveTimeoutRef.current = setTimeout(async () => {
        const data = {
          elements,
          appState,
        };

        try {
          // Save to IndexedDB
          await saveExcalidrawDrawing(currentProject.id, data);

          // Sync to cloud if authenticated
          if (user) {
            await syncExcalidrawToCloud(user.id, currentProject.id, data);
          }
        } catch (error) {
          console.error('Error saving drawing:', error);
        }
      }, 1000);
    },
    [currentProject?.id, user]
  );

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1a1a24]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Excalidraw
        key={key}
        initialData={initialData}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
}
