import express from 'express';
import { upload } from '../middleware/upload.js';
import { BadRequestError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequestError('Файл не был передан в запросе (ожидается поле file)');
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    logger.info('File uploaded successfully', {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
    });

    return res.status(201).json({
      success: true,
      message: 'Файл успешно загружен',
      data: {
        fileUrl,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
