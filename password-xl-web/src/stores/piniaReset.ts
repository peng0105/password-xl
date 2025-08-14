import {PiniaPluginContext} from "pinia";
import {pick} from "lodash-es";

declare module "pinia" {
    export interface _StoreWithState<Id extends string, S extends StateTree, G, A>
        extends StoreProperties<Id> {
        $resetFields<K extends keyof S>(fields?: K[]): void;
    }
}

export default ({options, store}: PiniaPluginContext): void => {
    store.$resetFields = (fields) => {
        const {state} = options;
        let originalState = state ? state() : {};
        store.$patch(($state) => {
            if (fields) {
                originalState = pick(originalState, fields);
            }
            Object.assign($state, originalState);
        });
    };
};
