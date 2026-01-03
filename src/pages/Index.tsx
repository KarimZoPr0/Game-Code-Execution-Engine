import PlaygroundLayout from '@/components/playground/PlaygroundLayout';
import { useLocalPersistence } from '@/hooks/useLocalPersistence';
import { useCloudSync } from '@/hooks/useCloudSync';

const Index = () => {
  // Initialize local persistence (IndexedDB + localStorage)
  useLocalPersistence();
  
  // Initialize cloud sync for authenticated users
  useCloudSync();

  return <PlaygroundLayout />;
};

export default Index;
