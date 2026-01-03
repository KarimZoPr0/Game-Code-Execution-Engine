import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export default function ExcalidrawPanel() {
  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <Excalidraw theme="dark" />
    </div>
  );
}
