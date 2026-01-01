import React from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

const TldrawPanel: React.FC = () => {
  return (
    <div className="tldraw-container h-full w-full">
      <Tldraw />
    </div>
  );
};

export default TldrawPanel;
