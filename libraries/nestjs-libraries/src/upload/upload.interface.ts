export interface IUploadProvider {
  uploadSimple(path: string | Buffer): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  removeFile(filePath: string): Promise<void>;
}
