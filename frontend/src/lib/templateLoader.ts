/**
 * Template Loader
 * 
 * Uses Vite's import.meta.glob to load all templates from the source system at build time.
 * No manual manifest or index files required!
 */

import { Project, ProjectFile } from "@/store/playgroundStore";

// Type for the glob result: Record<path, content>
type GlobResult = Record<string, string>;

// Load all files in templates directory as raw strings
// eager: true means they are bundled directly, available synchronously
// as: 'raw' means we get the file content as a string
const templateFiles = import.meta.glob('@/templates/**/*', {
    as: 'raw',
    eager: true
}) as GlobResult;

/**
 * Generate a unique ID for a file
 */
function generateId(name: string): string {
    return `file-${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Get language from file extension
 */
function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
        'c': 'c',
        'h': 'c',
        'cpp': 'cpp',
        'cc': 'cpp',
        'hpp': 'cpp',
        'js': 'javascript',
        'ts': 'typescript',
        'json': 'json',
        'html': 'html',
        'css': 'css',
        'md': 'markdown',
    };
    return languageMap[ext] || 'plaintext';
}

/**
 * Parse the flat glob result into structured Projects
 */
export async function loadAllTemplates(): Promise<Project[]> {
    const projectsMap = new Map<string, Project>();

    // Helper to get or create a folder in the file tree
    const getOrCreateFolder = (files: ProjectFile[], folderName: string): ProjectFile => {
        let folder = files.find(f => f.name === folderName && f.isFolder);
        if (!folder) {
            folder = {
                id: generateId(folderName),
                name: folderName,
                content: '',
                language: '',
                isFolder: true,
                children: []
            };
            files.push(folder);
        }
        return folder;
    };

    // Iterate over all files found by glob
    for (const [path, content] of Object.entries(templateFiles)) {
        // Path example: "/src/templates/simple-sdl-demo/main.c"
        // We want to strip the prefix to get relative path: "simple-sdl-demo/main.c"

        // Normalize path just in case
        const safePath = path.replace(/^\/src\/templates\/|^src\/templates\//, '');
        const parts = safePath.split('/');

        if (parts.length < 2) continue; // Skip files directly in templates root (if any)

        const projectName = parts[0];
        const fileName = parts[parts.length - 1];

        // Initialize project if not exists
        if (!projectsMap.has(projectName)) {
            projectsMap.set(projectName, {
                id: projectName,
                name: projectName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '), // Fallback name
                files: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }

        const project = projectsMap.get(projectName)!;

        // Handle template.json specifically for metadata, don't add as file (optional)
        if (fileName === 'template.json' && parts.length === 2) {
            try {
                const meta = JSON.parse(content);
                if (meta.name) project.name = meta.name;
                // We can create a hidden .meta file or similar if we really wanted to keep it,
                // but typically we just consume it. Let's consume it and NOT add it to files
                // to keep the project clean, unless looking for it. 
                // Actually, let's ADD it, so the user can see/edit the project config? 
                // No, typically metadata isn't part of the source. Let's verify metadata content.
                continue;
            } catch (e) {
                console.warn(`Failed to parse template.json for ${projectName}`, e);
            }
        }

        // Traverse structure to place file
        let currentLevel = project.files;

        // Iterate through folders (parts[1] to parts[length-2])
        for (let i = 1; i < parts.length - 1; i++) {
            const folder = getOrCreateFolder(currentLevel, parts[i]);
            if (!folder.children) folder.children = [];
            currentLevel = folder.children;
        }

        // Add file
        currentLevel.push({
            id: generateId(fileName),
            name: fileName,
            content: content,
            language: getLanguage(fileName),
            isFolder: false,
        });
    }

    return Array.from(projectsMap.values());
}
