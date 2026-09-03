import { versionedAsset } from '../core/asset-version.js';

export async function openCardHistoryModal(...args) {
    const history = await import(versionedAsset('/js/features/history.js'));
    return history.openCardHistoryModal(...args);
}
