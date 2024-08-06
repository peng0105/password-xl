import {RespData} from "@/types/index.ts";

interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
}

interface FilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
}

interface FileHandle {
    kind: "file";
    name: string;
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
    close(): Promise<void>;
}

export interface Env {
    electron: true
}

declare global {
    interface Window {
        env: Env;
        showOpenFilePicker: (options?: FilePickerOptions) => Promise<FileHandle[]>;
        showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileHandle>;
        electronAPI: {
            getFile(fileName: string): Promise<string>;
            uploadFile(fileName: string, content: string): Promise<RespData>;
            deleteFile(fileName: string): Promise<RespData>;
            setTopic(topic: string): void;
        }
    }
}