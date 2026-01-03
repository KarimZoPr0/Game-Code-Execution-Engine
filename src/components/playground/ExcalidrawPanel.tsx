import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

const ExcalidrawPanel: React.FC = () => {
  return (
    <div className="h-full w-full">
      <Excalidraw theme="dark" />
    </div>
  );
};

export default ExcalidrawPanel;
