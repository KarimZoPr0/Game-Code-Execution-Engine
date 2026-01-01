import React, { useCallback, useRef, useState } from 'react';
import * as FlexLayout from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import FileTree from './FileTree';
import MonacoEditor from './MonacoEditor';
import Console from './Console';
import GamePreview from './GamePreview';
import TldrawPanel from './TldrawPanel';
import Toolbar from './Toolbar';
import { PanelType } from '@/types/playground';
import { Plus } from 'lucide-react';

const defaultLayout: FlexLayout.IJsonModel = {
  global: {
    tabEnableClose: true,
    splitterSize: 4,
    tabSetEnableMaximize: true,
    tabSetEnableDrop: true,
    tabSetEnableDrag: true,
    tabSetEnableTabStrip: true,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset',
        weight: 15,
        children: [
          {
            type: 'tab',
            name: 'Files',
            component: 'filetree',
            enableClose: false,
          },
        ],
      },
      {
        type: 'row',
        weight: 85,
        children: [
          {
            type: 'row',
            weight: 70,
            children: [
              {
                type: 'tabset',
                weight: 60,
                children: [
                  {
                    type: 'tab',
                    name: 'Editor',
                    component: 'editor',
                  },
                ],
              },
              {
                type: 'tabset',
                weight: 40,
                children: [
                  {
                    type: 'tab',
                    name: 'Preview',
                    component: 'preview',
                  },
                ],
              },
            ],
          },
          {
            type: 'tabset',
            weight: 30,
            children: [
              {
                type: 'tab',
                name: 'Console',
                component: 'console',
              },
            ],
          },
        ],
      },
    ],
  },
};

interface AddPanelMenuProps {
  x: number;
  y: number;
  onSelect: (type: PanelType) => void;
  onClose: () => void;
}

const AddPanelMenu: React.FC<AddPanelMenuProps> = ({ x, y, onSelect, onClose }) => {
  const items = [
    { label: 'Text Editor', type: 'editor' as PanelType },
    { label: 'Game Preview', type: 'preview' as PanelType },
    { label: 'Console', type: 'console' as PanelType },
    { label: 'File Tree', type: 'filetree' as PanelType },
    { label: 'Drawing Board', type: 'tldraw' as PanelType },
  ];

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      onClose();
    };
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div 
      className="fixed bg-popover border border-panel-border rounded-md shadow-xl z-50 py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.type}
          className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-foreground flex items-center gap-2"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item.type);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

const PlaygroundLayout: React.FC = () => {
  const modelRef = useRef<FlexLayout.Model>(FlexLayout.Model.fromJson(defaultLayout));
  const layoutRef = useRef<FlexLayout.Layout>(null);
  const [menuState, setMenuState] = useState<{ x: number; y: number; tabsetId: string } | null>(null);

  const factory = useCallback((node: FlexLayout.TabNode) => {
    const component = node.getComponent();

    switch (component) {
      case 'filetree':
        return <FileTree />;
      case 'editor':
        return <MonacoEditor />;
      case 'console':
        return <Console />;
      case 'preview':
        return <GamePreview />;
      case 'tldraw':
        return <TldrawPanel />;
      default:
        return <div className="p-4 text-muted-foreground">Unknown panel: {component}</div>;
    }
  }, []);

  const handleAddPanel = useCallback((type: PanelType) => {
    const model = modelRef.current;
    
    const panelConfig: Record<PanelType, { name: string; component: string }> = {
      editor: { name: 'Editor', component: 'editor' },
      preview: { name: 'Preview', component: 'preview' },
      console: { name: 'Console', component: 'console' },
      filetree: { name: 'Files', component: 'filetree' },
      tldraw: { name: 'Drawing', component: 'tldraw' },
    };

    const config = panelConfig[type];
    if (!config) return;

    // Find active tabset or first tabset
    let targetTabset: FlexLayout.TabSetNode | undefined;
    model.visitNodes((node) => {
      if (node.getType() === 'tabset' && !targetTabset) {
        targetTabset = node as FlexLayout.TabSetNode;
      }
    });

    if (targetTabset) {
      model.doAction(
        FlexLayout.Actions.addNode(
          {
            type: 'tab',
            name: config.name,
            component: config.component,
          },
          targetTabset.getId(),
          FlexLayout.DockLocation.CENTER,
          -1
        )
      );
    }
  }, []);

  const handleAddToTabset = useCallback((type: PanelType, tabsetId: string) => {
    const model = modelRef.current;
    
    const panelConfig: Record<PanelType, { name: string; component: string }> = {
      editor: { name: 'Editor', component: 'editor' },
      preview: { name: 'Preview', component: 'preview' },
      console: { name: 'Console', component: 'console' },
      filetree: { name: 'Files', component: 'filetree' },
      tldraw: { name: 'Drawing', component: 'tldraw' },
    };

    const config = panelConfig[type];
    if (!config) return;

    model.doAction(
      FlexLayout.Actions.addNode(
        {
          type: 'tab',
          name: config.name,
          component: config.component,
        },
        tabsetId,
        FlexLayout.DockLocation.CENTER,
        -1
      )
    );
  }, []);

  const onRenderTabSet = useCallback(
    (node: FlexLayout.TabSetNode, renderValues: FlexLayout.ITabSetRenderValues) => {
      renderValues.stickyButtons.push(
        <button
          key="add"
          className="flexlayout__tab_toolbar_button flex items-center justify-center w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-primary"
          title="Add panel"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setMenuState({
              x: rect.left,
              y: rect.bottom + 4,
              tabsetId: node.getId(),
            });
          }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      );
    },
    []
  );

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <Toolbar onAddPanel={handleAddPanel} />
      <div className="flex-1 relative">
        <FlexLayout.Layout
          ref={layoutRef}
          model={modelRef.current}
          factory={factory}
          onRenderTabSet={onRenderTabSet}
        />
      </div>
      
      {menuState && (
        <AddPanelMenu
          x={menuState.x}
          y={menuState.y}
          onSelect={(type) => handleAddToTabset(type, menuState.tabsetId)}
          onClose={() => setMenuState(null)}
        />
      )}
    </div>
  );
};

export default PlaygroundLayout;
