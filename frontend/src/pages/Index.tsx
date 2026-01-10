import PlaygroundLayout from '@/components/playground/PlaygroundLayout';
import { useLocalPersistence } from '@/hooks/useLocalPersistence';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useTemplateLoader } from '@/hooks/useTemplateLoader';

const Index = () => {
  // Load project templates from src/templates directory
  useTemplateLoader();

  // Initialize local persistence (IndexedDB + localStorage)
  useLocalPersistence();

  // Initialize cloud sync for authenticated users
  useCloudSync();

  return <PlaygroundLayout />;
};

export default Index;
