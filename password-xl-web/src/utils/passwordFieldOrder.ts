import type {
    CustomField,
    Password,
    PasswordFieldRef,
    SortablePasswordField
} from '@/types';

export const DEFAULT_PASSWORD_FIELD_ORDER: SortablePasswordField[] = [
    'address',
    'username',
    'password',
    'labels',
    'remark',
];

export const PASSWORD_FIELD_LABELS: Record<SortablePasswordField, string> = {
    address: '地址',
    username: '用户名',
    password: '密码',
    labels: '标签',
    remark: '备注',
};

const CUSTOM_FIELD_PREFIX = 'custom:';
const BUILTIN_FIELD_SET = new Set<string>(DEFAULT_PASSWORD_FIELD_ORDER);
let fallbackId = Date.now();

export type OrderedPasswordField =
    | {
    ref: SortablePasswordField;
    type: 'builtin';
    key: SortablePasswordField;
}
    | {
    ref: `custom:${string}`;
    type: 'custom';
    field: CustomField;
};

export const createCustomFieldId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    fallbackId += 1;
    return `field-${fallbackId.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getCustomFieldRef = (field: CustomField): `custom:${string}` => {
    if (!field.id) {
        field.id = createCustomFieldId();
    }
    return `${CUSTOM_FIELD_PREFIX}${field.id}`;
};

const isCustomFieldRef = (fieldRef: string): fieldRef is `custom:${string}` => {
    return fieldRef.startsWith(CUSTOM_FIELD_PREFIX) && fieldRef.length > CUSTOM_FIELD_PREFIX.length;
};

const ensureCustomFieldIds = (password: Password) => {
    if (!Array.isArray(password.customFields)) {
        password.customFields = [];
    }

    const usedIds = new Set<string>();
    password.customFields = password.customFields.filter(field => field && typeof field === 'object');
    password.customFields.forEach(field => {
        const currentId = typeof field.id === 'string' ? field.id.trim() : '';
        if (!currentId || usedIds.has(currentId)) {
            let nextId = createCustomFieldId();
            while (usedIds.has(nextId)) {
                nextId = createCustomFieldId();
            }
            field.id = nextId;
        } else {
            field.id = currentId;
        }
        usedIds.add(field.id);
    });
};

const syncCustomFieldsToOrder = (password: Password) => {
    const customFieldMap = new Map(password.customFields.map(field => [field.id, field]));
    const sortedCustomFields: CustomField[] = [];

    password.fieldOrder?.forEach(fieldRef => {
        if (!isCustomFieldRef(fieldRef)) return;
        const field = customFieldMap.get(fieldRef.slice(CUSTOM_FIELD_PREFIX.length));
        if (!field) return;
        sortedCustomFields.push(field);
        customFieldMap.delete(field.id);
    });

    sortedCustomFields.push(...customFieldMap.values());
    const orderChanged = sortedCustomFields.length !== password.customFields.length
        || sortedCustomFields.some((field, index) => field !== password.customFields[index]);
    if (orderChanged) {
        password.customFields = sortedCustomFields;
    }
};

export const normalizePasswordFieldOrder = (password: Password): Password => {
    ensureCustomFieldIds(password);

    const validFieldRefs = new Set<PasswordFieldRef>([
        ...DEFAULT_PASSWORD_FIELD_ORDER,
        ...password.customFields.map(getCustomFieldRef),
    ]);
    const normalizedOrder: PasswordFieldRef[] = [];
    const addedFieldRefs = new Set<PasswordFieldRef>();

    if (Array.isArray(password.fieldOrder)) {
        password.fieldOrder.forEach(fieldRef => {
            if (
                typeof fieldRef === 'string'
                && validFieldRefs.has(fieldRef)
                && !addedFieldRefs.has(fieldRef)
            ) {
                normalizedOrder.push(fieldRef);
                addedFieldRefs.add(fieldRef);
            }
        });
    }

    DEFAULT_PASSWORD_FIELD_ORDER.forEach(fieldRef => {
        if (!addedFieldRefs.has(fieldRef)) {
            normalizedOrder.push(fieldRef);
            addedFieldRefs.add(fieldRef);
        }
    });
    password.customFields.forEach(field => {
        const fieldRef = getCustomFieldRef(field);
        if (!addedFieldRefs.has(fieldRef)) {
            normalizedOrder.push(fieldRef);
            addedFieldRefs.add(fieldRef);
        }
    });

    password.fieldOrder = normalizedOrder;
    syncCustomFieldsToOrder(password);
    return password;
};

export const normalizePasswordArray = (passwordArray: Password[]): Password[] => {
    passwordArray.forEach(normalizePasswordFieldOrder);
    return passwordArray;
};

export const resetPasswordFieldOrder = (password: Password): PasswordFieldRef[] => {
    normalizePasswordFieldOrder(password);
    password.fieldOrder = [
        ...DEFAULT_PASSWORD_FIELD_ORDER,
        ...password.customFields.map(getCustomFieldRef),
    ];
    syncCustomFieldsToOrder(password);
    return password.fieldOrder;
};

export const getOrderedPasswordFields = (password: Password): OrderedPasswordField[] => {
    const customFields = Array.isArray(password.customFields) ? password.customFields : [];
    const customFieldEntries = customFields.map((field, index) => ({
        ref: `${CUSTOM_FIELD_PREFIX}${field.id || `legacy-${index}`}` as `custom:${string}`,
        field,
    }));
    const customFieldMap = new Map(customFieldEntries.map(entry => [entry.ref, entry.field]));
    const requestedOrder = Array.isArray(password.fieldOrder) ? password.fieldOrder : [];
    const completeOrder: PasswordFieldRef[] = [];
    const addedRefs = new Set<PasswordFieldRef>();

    requestedOrder.forEach(fieldRef => {
        if (
            !addedRefs.has(fieldRef)
            && (BUILTIN_FIELD_SET.has(fieldRef) || customFieldMap.has(fieldRef as `custom:${string}`))
        ) {
            completeOrder.push(fieldRef);
            addedRefs.add(fieldRef);
        }
    });
    DEFAULT_PASSWORD_FIELD_ORDER.forEach(fieldRef => {
        if (!addedRefs.has(fieldRef)) {
            completeOrder.push(fieldRef);
            addedRefs.add(fieldRef);
        }
    });
    customFieldEntries.forEach(({ref}) => {
        if (!addedRefs.has(ref)) {
            completeOrder.push(ref);
            addedRefs.add(ref);
        }
    });

    const orderedFields: OrderedPasswordField[] = [];

    completeOrder.forEach(fieldRef => {
        if (BUILTIN_FIELD_SET.has(fieldRef)) {
            const key = fieldRef as SortablePasswordField;
            orderedFields.push({ref: key, type: 'builtin', key});
            return;
        }
        if (!isCustomFieldRef(fieldRef)) return;
        const field = customFieldMap.get(fieldRef);
        if (field) {
            orderedFields.push({ref: fieldRef, type: 'custom', field});
        }
    });
    return orderedFields;
};

export const passwordFieldHasValue = (password: Password, orderedField: OrderedPasswordField): boolean => {
    if (orderedField.type === 'custom') {
        return Boolean(orderedField.field.key || orderedField.field.val);
    }
    if (orderedField.key === 'labels') {
        return Array.isArray(password.labels) && password.labels.length > 0;
    }
    return Boolean(password[orderedField.key]);
};

export const finalizePasswordFieldOrder = (password: Password): Password => {
    normalizePasswordFieldOrder(password);
    syncCustomFieldsToOrder(password);
    return password;
};
