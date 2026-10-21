import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PROVISIONAL_FILE_POLICY } from './provisional-file-policy.config';

export interface UploadedFileMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  storageKey: string;
}

@Injectable()
export class PrivateStorageService {
  private readonly storageDirectory: string;

  constructor() {
    this.storageDirectory = path.resolve(
      process.cwd(),
      process.env.STORAGE_PATH || 'uploads/attachments',
    );
    this.ensureDirectoryExists(this.storageDirectory);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Sanitiza el nombre del archivo para prevenir path traversal y caracteres peligrosos.
   */
  sanitizeFileName(originalName: string): string {
    const baseName = path.basename(originalName);
    return baseName.replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚñÑ ]/g, '_');
  }

  /**
   * Valida y almacena un archivo en el almacenamiento privado seguro.
   */
  async storeFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<UploadedFileMetadata> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('El archivo enviado está vacío');
    }

    // 1. Validar tamaño máximo provisional (10 MB)
    if (fileBuffer.length > PROVISIONAL_FILE_POLICY.maxFileSizeBytes) {
      throw new BadRequestException(
        `El tamaño del archivo supera el límite permitido de ${
          PROVISIONAL_FILE_POLICY.maxFileSizeBytes / (1024 * 1024)
        } MB (PEN-07 provisional)`,
      );
    }

    // 2. Validar tipo MIME permitido
    const normalizedMime = mimeType.toLowerCase();
    if (
      !(PROVISIONAL_FILE_POLICY.allowedMimeTypes as readonly string[]).includes(
        normalizedMime,
      )
    ) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${mimeType}). Formatos admitidos: JPG, PNG, WEBP, PDF, DOCX, XLSX (PEN-07 provisional)`,
      );
    }

    // 3. Sanitizar nombre de archivo
    const sanitizedName = this.sanitizeFileName(originalName);

    // 4. Calcular hash SHA-256 para integridad
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 5. Generar storageKey aleatoria inexpugnable (la ruta en disco NUNCA se expone)
    const storageKey = `att_${crypto.randomUUID()}`;
    const destinationPath = path.join(this.storageDirectory, storageKey);

    try {
      await fs.promises.writeFile(destinationPath, fileBuffer);
    } catch (error) {
      throw new InternalServerErrorException(
        'Error al guardar el archivo en el almacenamiento privado',
      );
    }

    return {
      fileName: sanitizedName,
      fileSize: fileBuffer.length,
      mimeType: normalizedMime,
      sha256,
      storageKey,
    };
  }

  /**
   * Lee un archivo desde el almacenamiento privado.
   */
  async getFile(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.storageDirectory, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('El archivo solicitado no existe en almacenamiento');
    }
    return fs.promises.readFile(filePath);
  }

  /**
   * Elimina un archivo físico si existe.
   */
  async deleteFile(storageKey: string): Promise<void> {
    const filePath = path.join(this.storageDirectory, storageKey);
    if (fs.existsSync(filePath)) {
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // Ignorar fallo de borrado físico
      }
    }
  }
}
