import { DrawWorkingFileLayerOptions, WorkingFileLayer, ColorModel } from '@/types';
import BaseLayerRenderer from './base';

export default class RasterSequenceLayerRenderer extends BaseLayerRenderer {
    onUpdate(updates: Partial<WorkingFileLayer<ColorModel>>) {
        // Override
    }

    onDraw(ctx: CanvasRenderingContext2D, layer: WorkingFileLayer<ColorModel>, options: DrawWorkingFileLayerOptions = {}) {
        // Override
    }
}
