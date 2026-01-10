import { useParams } from 'react-router-dom';
import { getPreviewUrl } from '@/lib/api';

const Preview = () => {
  const { buildId } = useParams<{ buildId: string }>();
  
  if (!buildId) {
    return (
      <div className="w-screen h-screen bg-[#14141e] flex items-center justify-center text-white">
        Invalid build ID
      </div>
    );
  }

  const previewUrl = getPreviewUrl(buildId);

  return (
    <div className="w-screen h-screen bg-[#14141e]">
      <iframe
        src={previewUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
        title="Game Preview"
      />
    </div>
  );
};

export default Preview;
