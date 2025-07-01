import * as unplugin from 'unplugin';

declare const preload: unplugin.UnpluginInstance<unknown, boolean>;

interface PreloadOptions {
}
interface RendererOptions {
    preloadEntry: string;
}

declare const renderer: unplugin.UnpluginInstance<RendererOptions | undefined, boolean>;

export { type PreloadOptions, type RendererOptions, preload, renderer };
