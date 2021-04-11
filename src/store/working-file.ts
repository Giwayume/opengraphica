import { PerformantStore } from './performant-store';
import { RGBAColor, CanvasRenderingContext2DEnhanced, ColorModelName, WorkingFileLayer, WorkingFileRasterLayer } from '@/types';

interface WorkingFileState {
    activeLayer: WorkingFileLayer<RGBAColor> | null,
    colorModel: ColorModelName;
    colorSpace: string;
    drawOriginX: number;
    drawOriginY: number;
    height: number; // Always pixels
    layerIdCounter: number;
    layers: WorkingFileLayer<RGBAColor>[];
    measuringUnits: 'px' | 'mm' | 'cm' | 'in';
    resolutionUnits: 'px/in' | 'px/mm' | 'px/cm';
    resolutionX: number;
    resolutionY: number;
    scaleFactor: number;
    width: number; // Always pixels
}

interface WorkingFileStore {
    dispatch: {};
    state: WorkingFileState;
}

const store = new PerformantStore<WorkingFileStore>({
    state: {
        activeLayer: null,
        colorModel: 'rgba',
        colorSpace: 'sRGB',
        drawOriginX: 0,
        drawOriginY: 0,
        height: 892, // Always pixels
        layerIdCounter: 0,
        layers: [],
        measuringUnits: 'px',
        resolutionUnits: 'px/in',
        resolutionX: 300,
        resolutionY: 300,
        scaleFactor: 1,
        width: 818 // Always pixels
    }
});

export default store;

export { WorkingFileStore, WorkingFileState };
