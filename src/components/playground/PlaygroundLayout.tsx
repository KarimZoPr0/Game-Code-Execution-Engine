import React, { useCallback, useRef, useEffect } from 'react';
import * as FlexLayout from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import FileTree from './FileTree';
import MonacoEditor from './MonacoEditor';
import Console from './Console';
import GamePreview from './GamePreview';
import ExcalidrawPanel from './ExcalidrawPanel';
import Toolbar from './Toolbar';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { getStoredLayout, saveLayout } from '@/lib/storage/localStorage';

const defaultLayout: FlexLayout.IJsonModel = {
  global: {
    tabEnableClose: false,
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
                    enableClose: false,
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
                    enableClose: false,
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
                enableClose: false,
              },
              {
                type: 'tab',
                name: 'Drawing',
                component: 'excalidraw',
                enableClose: false,
              },
            ],
          },
        ],
      },
    ],
  },
};

const PlaygroundLayout: React.FC = () => {
  // Try to load saved layout, fallback to default
  const getInitialModel = () => {
    const savedLayout = getStoredLayout();
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        // Ensure global settings are correct (panels non-closable)
        parsed.global = {
          ...parsed.global,
          tabEnableClose: false,
        };
        return FlexLayout.Model.fromJson(parsed);
      } catch (e) {
        console.warn('Failed to parse saved layout, using default');
      }
    }
    return FlexLayout.Model.fromJson(defaultLayout);
  };

  const modelRef = useRef<FlexLayout.Model>(getInitialModel());
  const layoutRef = useRef<FlexLayout.Layout>(null);
  
  const { setLayoutModel } = usePlaygroundStore();

  // Store the model reference for use by FileTree
  useEffect(() => {
    setLayoutModel(modelRef.current);
  }, [setLayoutModel]);

  // Save layout on model change
  const handleModelChange = useCallback((model: FlexLayout.Model) => {
    try {
      const json = model.toJson();
      saveLayout(JSON.stringify(json));
    } catch (e) {
      console.warn('Failed to save layout:', e);
    }
  }, []);

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
      case 'excalidraw':
        return <ExcalidrawPanel />;
      default:
        return <div className="p-4 text-muted-foreground">Unknown panel: {component}</div>;
    }
  }, []);

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <Toolbar />
      <div className="flex-1 relative">
        <FlexLayout.Layout
          ref={layoutRef}
          model={modelRef.current}
          factory={factory}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
};

export default PlaygroundLayout;
