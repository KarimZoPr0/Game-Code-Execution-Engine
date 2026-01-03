import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const ExcalidrawPanel: React.FC = () => {
  return (
    <div className="h-screen w-full">
      <Excalidraw theme="dark" />
    </div>
  );
};

export default ExcalidrawPanel;
