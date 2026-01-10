import { useEffect, useLayoutEffect } from 'react';
import { usePlaygroundStore } from '@/store/playgroundStore';

/**
 * Hook to load project templates on app startup
 * Uses useLayoutEffect to load templates BEFORE any other effects run
 */
export function useTemplateLoader() {
    const loadTemplates = usePlaygroundStore((state) => state.loadTemplates);
    const templatesLoaded = usePlaygroundStore((state) => state.templatesLoaded);
    const templatesLoading = usePlaygroundStore((state) => state.templatesLoading);

    // Use useLayoutEffect to run synchronously before paint
    // This ensures templates load BEFORE persistence tries to restore
    useLayoutEffect(() => {
        if (!templatesLoaded && !templatesLoading) {
            loadTemplates();
        }
    }, [loadTemplates, templatesLoaded, templatesLoading]);

    return { templatesLoaded, templatesLoading };
}
